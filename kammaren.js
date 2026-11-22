/* Moduler: Kammaren (dagens program, pågår nu) och Kalender (kommande dagar). Data: data.program från kalender-API:et. */
(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const IKON = {
    play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
    pil: '<path d="M9 5l7 7-7 7"/>',
  };
  const ikon = (n, stil) => `<svg class="ikon" aria-hidden="true" viewBox="0 0 24 24"${stil ? ` style="${stil}"` : ''}>${IKON[n]}</svg>`;
  const WEBBTV = 'https://www.riksdagen.se/sv/webb-tv/';

  const VECKODAG = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
  const KORT_DAG = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
  const MANAD = ['jan', 'feb', 'mars', 'april', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const dt = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const datumText = iso => { const d = dt(iso); return `${VECKODAG[d.getDay()]} ${d.getDate()} ${MANAD[d.getMonth()]}`; };

  function nuStockholm() {
    const delar = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).reduce((o, p) => (o[p.type] = p.value, o), {});
    return { datum: `${delar.year}-${delar.month}-${delar.day}`, tid: `${delar.hour === '24' ? '00' : delar.hour}:${delar.minute}` };
  }

  function typ(h) {
    if (h.typ === 'votering' || /^beslut/i.test(h.titel)) return { namn: 'Beslut', klass: 'orange' };
    if (/fråge/i.test(h.titel) || /fråge/.test(h.typ)) return { namn: 'Frågor', klass: 'gra' };
    if (/debatt|plenum/i.test(h.titel + ' ' + h.typ)) return { namn: 'Debatt', klass: 'bla' };
    return { namn: 'Övrigt', klass: 'gra' };
  }

  /** Vilken händelse pågår: startad och nästa (med tid) har inte börjat, högst 4 h efter start. */
  function pagaende(dagens, tid) {
    const medTid = dagens.filter(h => h.tid);
    for (let i = medTid.length - 1; i >= 0; i--) {
      const h = medTid[i];
      if (h.tid > tid) continue;
      const [hh, mm] = h.tid.split(':').map(Number);
      const [nh, nm] = tid.split(':').map(Number);
      return (nh * 60 + nm) - (hh * 60 + mm) <= 240 ? h : null;
    }
    return null;
  }

  function rad(h, markerad) {
    const t = typ(h);
    const antal = h.arenden && h.arenden.length;
    return `<div class="prog-rad${markerad ? ' nu' : ''}">
      <span class="prog-tid">${esc(h.tid || '–')}</span>
      <span class="text"><span class="titel">${esc(h.titel)}</span>${antal ? `<span class="under">${antal} ärende${antal === 1 ? '' : 'n'}</span>` : ''}</span>
      <span class="chip ${t.klass}">${t.namn}</span>
    </div>`;
  }

  function huvudkort(h, pagar) {
    const t = typ(h);
    const arenden = (h.arenden || []).slice(0, 4).map(a => `<li>${esc(a.titel)}</li>`).join('');
    const fler = (h.arenden || []).length > 4 ? `<li class="fler">+ ${h.arenden.length - 4} till</li>` : '';
    return `<section class="nu-kort glas" data-testid="nu-kort">
      <div class="nu-topp">
        ${pagar ? '<span class="live"><i></i>PÅGÅR NU</span>' : `<span class="chip ${t.klass}">Nästa · ${esc(h.tid || '')}</span>`}
        <span class="under">${pagar ? 'sedan ' + esc(h.tid) : ''}</span>
      </div>
      <h2>${esc(h.titel)}</h2>
      ${arenden ? `<ul class="nu-lista">${arenden}${fler}</ul>` : ''}
      <a class="knapp" href="${WEBBTV}" target="_blank" rel="noopener">${ikon('play', 'width:16px;height:16px')}${pagar ? 'Titta live' : 'Webb-tv'}</a>
    </section>`;
  }

  function kammaren(el, data) {
    const nu = nuStockholm();
    const program = (data && data.program) || [];
    const idag = program.filter(h => h.datum === nu.datum);
    const pagar = pagaende(idag, nu.tid);
    const nasta = idag.find(h => h.tid && h.tid > nu.tid);
    let innehall;
    if (idag.length) {
      const fokus = pagar || nasta;
      innehall = `${fokus ? huvudkort(fokus, fokus === pagar) : ''}
        <h2>Idag</h2>
        <div class="lista glas" data-testid="idag">${idag.map(h => rad(h, h === pagar)).join('')}</div>`;
    } else {
      const kommande = program.find(h => h.datum > nu.datum);
      const dag = kommande ? program.filter(h => h.datum === kommande.datum) : [];
      innehall = `<section class="tom glas" data-testid="tom-kammare"><strong>Inget i kammaren idag</strong>
          <span>${kommande ? `Nästa sammanträde är ${esc(datumText(kommande.datum))}.` : 'Inga kommande sammanträden i kalendern.'}</span></section>
        ${dag.length ? `<h2 style="text-transform:none">${esc(datumText(kommande.datum).replace(/^./, c => c.toUpperCase()))}</h2><div class="lista glas">${dag.map(h => rad(h)).join('')}</div>` : ''}`;
    }
    el.innerHTML = `<header class="rubrik"><div><p class="overrad">${esc(datumText(nu.datum))}</p><h1>Kammaren</h1></div></header>
      ${innehall}
      <p class="liten">Källa: riksdagens kalender. Tider kan ändras med kort varsel.</p>`;
  }

  let valdDag = null;
  function kalender(el, data) {
    const nu = nuStockholm();
    const program = ((data && data.program) || []).filter(h => h.datum >= nu.datum);
    const dagar = [...new Set(program.map(h => h.datum))];
    if (!dagar.length) {
      el.innerHTML = `<header class="rubrik"><div><p class="overrad">Kommande</p><h1>Kalender</h1></div></header>
        <section class="tom glas"><strong>Inget planerat</strong><span>Kalendern har inga kammarhändelser de närmaste två veckorna.</span></section>`;
      return;
    }
    if (!dagar.includes(valdDag)) valdDag = dagar[0];
    const beslutsdagar = new Set(program.filter(h => typ(h).namn === 'Beslut').map(h => h.datum));
    const chips = dagar.map(d => {
      const x = dt(d);
      return `<button type="button" class="dag${d === valdDag ? ' vald' : ''}" data-dag="${d}" aria-pressed="${d === valdDag}" aria-label="${esc(datumText(d))}">
        <span>${KORT_DAG[x.getDay()]}</span><b>${x.getDate()}</b><i class="${beslutsdagar.has(d) ? 'prick' : ''}"></i></button>`;
    }).join('');
    const dagens = program.filter(h => h.datum === valdDag);
    const arenden = dagens.flatMap(h => h.arenden || []);
    el.innerHTML = `<header class="rubrik"><div><p class="overrad">Två veckor framåt</p><h1>Kalender</h1></div></header>
      <div class="dagar glas" data-testid="dagar">${chips}</div>
      <h2>${esc(datumText(valdDag).replace(/^./, c => c.toUpperCase()))}</h2>
      <div class="lista glas" data-testid="dagens-program">${dagens.map(h => rad(h)).join('')}</div>
      ${arenden.length ? `<h2>Ärenden <span style="color:var(--text-3);font-weight:600">${arenden.length}</span></h2>
        <div class="lista glas">${arenden.map(a => `<div class="prog-rad"><span class="text"><span class="titel">${esc(a.titel)}</span><span class="under">${esc(a.beteckning)}</span></span></div>`).join('')}</div>` : ''}
      <p class="liten">Orange prick = beslut den dagen</p>`;
    el.querySelectorAll('[data-dag]').forEach(b => b.addEventListener('click', () => { valdDag = b.dataset.dag; kalender(el, data); }));
  }

  window.KKKammaren = { kammaren, kalender, pagaende };
})();
