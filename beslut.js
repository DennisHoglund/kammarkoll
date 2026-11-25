/* Modul: Dagens beslut – rösta på dagens ärenden, se utfall och din dag i kammaren. */
(function () {
  'use strict';

  const IKON = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    klocka: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    dok: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    tillbaka: '<path d="M15 5l-7 7 7 7"/>',
    streck: '<path d="M6 12h12"/>',
  };
  const ikon = (n, extra) => `<svg class="ikon"${extra ? ' ' + extra : ''} aria-hidden="true" viewBox="0 0 24 24">${IKON[n]}</svg>`;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VAL_TEXT = { ja: 'ja', nej: 'nej', avstar: 'avstår' };

  const VECKODAG = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
  const MANAD = ['jan', 'feb', 'mars', 'april', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];
  function datumText(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return `${VECKODAG[dt.getDay()]} ${d} ${MANAD[m - 1]}`;
  }

  let vy = { typ: 'flode' };

  function render(el, data, opts) {
    data = data.__ra || data; // render anropas igen med härledd data – utgå alltid från originalet
    const roster = KKData.roster(data.datum);
    const alla = data.arenden || [];
    // Ärenden utan reservationer är eniga – de visas i sammanfattningen men behöver ingen röst.
    const strid = alla.filter(a => a.reservationer !== 0);
    const arenden = strid.length ? strid : alla;
    data = Object.assign({}, data, { __ra: data, arenden, eniga: strid.length ? alla.filter(a => a.reservationer === 0) : [] });
    const offline = opts && opts.offline;

    if (!alla.length) return tomDag(el, data);
    if (vy.typ === 'resultat') {
      const a = alla.find(x => x.id === vy.id);
      if (a) return resultat(el, data, a, roster);
      vy = { typ: 'flode' };
    }
    const nasta = arenden.find(a => !roster[a.id]);
    if (vy.typ === 'flode' && nasta) return kort(el, data, nasta, roster, offline);
    return sammanfattning(el, data, roster);
  }

  function rubrik(data, overrad, titel, hoger) {
    return `<header class="rubrik"><div><p class="overrad">${esc(overrad)}</p><h1>${esc(titel)}</h1></div>${hoger || ''}</header>`;
  }

  function kort(el, data, a, roster, offline) {
    const arenden = data.arenden;
    const index = arenden.indexOf(a);
    const u = KKData.utskott(a.utskott);
    const tid = data.beslutstid ? `Beslut ${esc(data.beslutstid)}` : 'Beslut idag';
    const prickar = arenden.map(x => `<span class="${roster[x.id] || x === a ? 'klar' : ''}"></span>`).join('');
    el.innerHTML = `
      ${rubrik(data, datumText(data.datum) + (data.beslutstid ? ' · votering ' + data.beslutstid : ''), 'Dagens beslut',
        `<span class="overrad" style="font-size:15px" data-testid="position">${index + 1} av ${arenden.length}</span>`)}
      <div class="prickar" style="grid-template-columns:repeat(${arenden.length},minmax(0,1fr))">${prickar}</div>
      <article class="kort glas" data-testid="arendekort">
        <div class="kort-topp" style="background:${u.farg}">
          <div class="rad"><span class="chip">${esc(u.namn)}</span><span style="display:flex;align-items:center;gap:5px">${ikon('klocka')}${a.status === 'beslutat' ? 'Beslutat' : tid}</span></div>
          <h2>${esc(a.titel)}</h2>
        </div>
        <div class="kort-kropp">
          <div style="display:flex;flex-direction:column;gap:6px">
            <p class="overrad" style="font-size:12px">Vad handlar det om?</p>
            <p>${esc(a.fraga || a.sammanfattning || a.titel)}</p>
          </div>
          <div class="chips">
            ${a.utskottSager ? `<span class="chip bla">Utskottet säger ${esc(a.utskottSager)}</span>` : ''}
            ${reservationsChip(a.reservationer)}
            ${a.motioner ? `<span class="chip gra">${ikon('dok', 'style="width:14px;height:14px"')}${a.motioner} motioner ingår</span>` : ''}
          </div>
          <p class="fraga">Hur skulle du rösta?</p>
          <div class="rosta">
            <button type="button" class="nej" data-val="nej">${ikon('x')}Nej</button>
            <button type="button" class="avstar" data-val="avstar">Avstår</button>
            <button type="button" class="ja" data-val="ja">${ikon('check')}Ja</button>
          </div>
        </div>
      </article>
      ${data.exempel ? '<p class="liten">Exempeldata</p>' : ''}
      ${offline ? '<p class="liten">Offline – visar senast hämtade</p>' : ''}`;
    el.querySelectorAll('[data-val]').forEach(b => b.addEventListener('click', () => {
      KKData.rosta(data.datum, a.id, b.dataset.val);
      vy = a.status === 'beslutat' ? { typ: 'resultat', id: a.id } : { typ: 'flode' };
      render(el, data);
    }));
  }

  function reservationsChip(n) {
    if (n == null) return '';
    if (n === 0) return '<span class="chip gra">Enigt utskott</span>';
    const text = `${n} reservation${n === 1 ? '' : 'er'}`;
    return n >= 3
      ? `<span class="chip orange" data-testid="omstritt">Omstritt · ${text}</span>`
      : `<span class="chip gra">${text}</span>`;
  }

  // Riksdagens svar: voteringens utfall, eller ja när förslaget bifölls utan votering (acklamation).
  function utfall(a) {
    if (a.status !== 'beslutat') return null;
    return a.resultat ? a.resultat.utfall : a.acklamation ? 'ja' : null;
  }

  function jamfor(dittVal, a) {
    const u = utfall(a);
    if (!u) return 'vantar';
    if (!dittVal || dittVal === 'avstar') return 'vantar';
    return dittVal === u ? 'lika' : 'olika';
  }

  function sammanfattning(el, data, roster) {
    const arenden = data.arenden;
    const avgjorda = arenden.filter(a => utfall(a) && roster[a.id] && roster[a.id] !== 'avstar');
    const lika = avgjorda.filter(a => roster[a.id] === utfall(a)).length;
    const omkrets = 2 * Math.PI * 44;
    const andel = avgjorda.length ? lika / avgjorda.length : 0;
    const allaBeslutade = arenden.every(a => a.status === 'beslutat');
    const rader = arenden.map(a => {
      const j = jamfor(roster[a.id], a);
      const ik = j === 'lika' ? 'check' : j === 'olika' ? 'x' : 'klocka';
      const rd = utfall(a) ? VAL_TEXT[utfall(a)] + (a.acklamation ? ' (utan votering)' : '') : 'beslut ' + (data.beslutstid || 'senare');
      return `<button type="button" class="rad-arende" data-id="${esc(a.id)}">
        <span class="markor ${j}">${ikon(ik)}</span>
        <span class="text"><span class="titel">${esc(a.titel)}</span><span class="under">Du: ${VAL_TEXT[roster[a.id]] || '–'} · Riksdagen: ${esc(rd)}</span></span>
      </button>`;
    }).join('');
    el.innerHTML = `
      ${rubrik(data, datumText(data.datum) + (allaBeslutade ? ' · alla beslut fattade' : ''), 'Din dag i kammaren')}
      <section class="ring-kort glas" data-testid="summering">
        <div class="ring">
          <svg viewBox="0 0 104 104" aria-hidden="true"><circle cx="52" cy="52" r="44" fill="none" stroke="var(--linje)" stroke-width="12"/><circle cx="52" cy="52" r="44" fill="none" stroke="var(--accent)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(omkrets * andel).toFixed(1)} ${omkrets.toFixed(1)}"/></svg>
          <div class="varde">${avgjorda.length ? `${lika}/${avgjorda.length}` : '–'}</div>
        </div>
        <div class="text">
          <strong>${avgjorda.length ? `Du röstade som riksdagen i ${lika} av ${avgjorda.length}` : 'Väntar på besluten'}</strong>
          <span>${avgjorda.length ? 'Tryck på ett ärende för att se utfallet' : `Utfallet syns här efter voteringen${data.beslutstid ? ' ' + esc(data.beslutstid) : ''}`}</span>
        </div>
      </section>
      <h2>Dagens beslut</h2>
      <div class="lista glas">${rader}</div>
      ${eniga(data)}
      ${nastaInfo(data)}
      ${data.exempel ? '<p class="liten">Exempeldata</p>' : ''}`;
    el.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => {
      const a = data.arenden.concat(data.eniga || []).find(x => x.id === b.dataset.id);
      if (a && utfall(a)) { vy = { typ: 'resultat', id: a.id }; render(el, data); }
    }));
  }

  function eniga(data) {
    if (!data.eniga || !data.eniga.length) return '';
    const rader = data.eniga.map(a => {
      const klar = utfall(a);
      return `<button type="button" class="rad-arende" data-id="${esc(a.id)}">
        <span class="markor vantar">${ikon(klar ? 'check' : 'klocka')}</span>
        <span class="text"><span class="titel">${esc(a.titel)}</span><span class="under">${esc(KKData.utskott(a.utskott).namn)}${klar ? (a.acklamation ? ' · beslutat utan votering' : ' · riksdagen sa ' + VAL_TEXT[klar]) : ''}</span></span>
      </button>`;
    }).join('');
    return `<h2>Eniga beslut <span style="color:var(--text-3);font-weight:600">${data.eniga.length}</span></h2>
      <p class="liten" style="text-align:left;margin-top:-8px">Inga reservationer i utskottet – därför inget att rösta om.</p>
      <div class="lista glas" data-testid="eniga">${rader}</div>`;
  }

  function nastaInfo(data) {
    if (!data.nasta) return '';
    return `<section class="info glas"><p class="overrad" style="font-size:12px">Nästa beslut</p>
      <strong>${esc(datumText(data.nasta.datum))}${data.nasta.tid ? ' ' + esc(data.nasta.tid) : ''}${data.nasta.antal ? ` · ${data.nasta.antal} ärenden` : ''}</strong></section>`;
  }

  function resultat(el, data, a, roster) {
    if (!a.resultat) return utanVotering(el, data, a, roster);
    const r = a.resultat;
    const u = KKData.utskott(a.utskott);
    const ditt = roster[a.id];
    const j = jamfor(ditt, a);
    const partier = (r.partier || []).map(p => {
      const tot = (p.ja || 0) + (p.nej || 0) + (p.avstar || 0) + (p.franvarande || 0) || 1;
      const pr = n => ((n || 0) / tot * 100).toFixed(1) + '%';
      return `<div class="parti-rad"><b>${esc(p.parti)}</b>
        <span class="stapel"><i style="width:${pr(p.ja)};background:var(--accent)"></i><i style="width:${pr(p.nej)};background:var(--nej)"></i><i style="width:${pr(p.avstar)};background:var(--text-3)"></i></span>
        <span class="tal">${p.ja || 0}–${p.nej || 0}</span></div>`;
    }).join('');
    el.innerHTML = `
      <div><button type="button" class="tillbaka glas" aria-label="Tillbaka">${ikon('tillbaka')}</button></div>
      <header style="display:flex;flex-direction:column;gap:4px">
        <p class="overrad">${esc(u.namn)}${a.beteckning ? ' · ' + esc(a.beteckning) : ''}</p>
        <h1 style="font-size:28px;line-height:33px">${esc(a.titel)}</h1>
      </header>
      <section class="resultat glas" data-testid="resultat">
        <span class="utfall ${r.utfall}">${ikon(r.utfall === 'ja' ? 'check' : 'x')}RIKSDAGEN SA ${r.utfall === 'ja' ? 'JA' : 'NEJ'}</span>
        <div class="sal">${KKSal.svg(r)}<div class="siffror">${r.ja}–${r.nej}</div></div>
        <div class="forklaring">
          <span><i style="background:var(--accent)"></i>Ja ${r.ja}</span>
          <span><i style="background:var(--nej)"></i>Nej ${r.nej}</span>
          ${r.avstar ? `<span><i style="background:var(--text-3)"></i>Avstår ${r.avstar}</span>` : ''}
          <span><i style="background:var(--franvarande)"></i>Frånvarande ${r.franvarande || 0}</span>
        </div>
        ${r.punkt ? `<p class="liten" style="margin:0">Votering om förslagspunkt ${esc(r.punkt)}${r.voteringar > 1 ? ` – ärendet hade ${esc(r.voteringar)} voteringar` : ''}${r.tid ? ` · kl. ${esc(r.tid)}` : ''}</p>` : ''}
      </section>
      ${j === 'vantar' ? '' : `<section class="du ${j}"><span class="rund">${ikon(j === 'lika' ? 'check' : 'x')}</span>
        <div><strong>Du röstade ${VAL_TEXT[ditt]} – ${j === 'lika' ? 'som riksdagen' : 'mot riksdagen'}</strong></div></section>`}
      ${partier ? `<h2>Så röstade partierna</h2><div class="partier glas">${partier}</div>` : ''}
      ${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener" style="text-align:center;font-weight:600">Läs ärendet på riksdagen.se</a>` : ''}`;
    el.querySelector('.tillbaka').addEventListener('click', () => { vy = { typ: 'flode' }; render(el, data); });
    el.focus();
  }

  // Beslut utan votering: kammaren biföll utskottets förslag (acklamation) – inga siffror att visa.
  function utanVotering(el, data, a, roster) {
    const u = KKData.utskott(a.utskott);
    const ditt = roster[a.id];
    const j = jamfor(ditt, a);
    el.innerHTML = `
      <div><button type="button" class="tillbaka glas" aria-label="Tillbaka">${ikon('tillbaka')}</button></div>
      <header style="display:flex;flex-direction:column;gap:4px">
        <p class="overrad">${esc(u.namn)}${a.beteckning ? ' · ' + esc(a.beteckning) : ''}</p>
        <h1 style="font-size:28px;line-height:33px">${esc(a.titel)}</h1>
      </header>
      <section class="resultat glas" data-testid="resultat">
        <span class="utfall ja">${ikon('check')}RIKSDAGEN SA JA</span>
        <p style="margin:0;text-align:center"><strong>Beslutat utan votering</strong><br>
          <span class="liten">Ingen begärde votering, så kammaren biföll utskottets förslag med acklamation.</span></p>
      </section>
      ${j === 'vantar' ? '' : `<section class="du ${j}"><span class="rund">${ikon(j === 'lika' ? 'check' : 'x')}</span>
        <div><strong>Du röstade ${VAL_TEXT[ditt]} – ${j === 'lika' ? 'som riksdagen' : 'mot riksdagen'}</strong></div></section>`}
      ${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener" style="text-align:center;font-weight:600">Läs ärendet på riksdagen.se</a>` : ''}`;
    el.querySelector('.tillbaka').addEventListener('click', () => { vy = { typ: 'flode' }; render(el, data); });
    el.focus();
  }

  function tomDag(el, data) {
    el.innerHTML = `
      ${rubrik(data, datumText(data.datum), 'Dagens beslut')}
      <section class="tom glas" data-testid="tom-dag"><strong>Inga beslut idag</strong>
        <span>Kammaren fattar inga beslut idag. Du får en notis när nästa omgång är klar.</span></section>
      ${nastaInfo(data)}`;
  }

  window.KKBeslut = { render, aterstall: () => { vy = { typ: 'flode' }; } };
})();
