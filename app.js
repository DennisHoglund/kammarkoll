/* Skal: flikar, tema, laddning av data och service worker. */
(function () {
  'use strict';

  const vy = document.getElementById('vy');
  const knappar = document.querySelectorAll('[data-flik]');
  let data = null, offline = false, flik = 'beslut';

  function lasFlik() {
    try { return localStorage.getItem('kk_flik') || 'beslut'; } catch (e) { return 'beslut'; }
  }
  function sparaFlik(f) { try { localStorage.setItem('kk_flik', f); } catch (e) { /* */ } }

  function visa(f) {
    flik = f;
    sparaFlik(f);
    knappar.forEach(k => k.toggleAttribute('aria-current', false));
    const aktiv = document.querySelector(`[data-flik="${f}"]`);
    if (aktiv) aktiv.setAttribute('aria-current', 'page');
    window.scrollTo(0, 0);
    if (f === 'beslut') {
      if (!data) { vy.innerHTML = '<p class="liten">Laddar…</p>'; return; }
      KKBeslut.render(vy, data, { offline });
    } else if (f === 'mer') {
      mer();
    } else {
      const namn = { kammaren: 'Kammaren', kalender: 'Kalender' }[f];
      vy.innerHTML = `<header class="rubrik"><div><p class="overrad">Kommer snart</p><h1>${namn}</h1></div></header>
        <section class="tom glas"><strong>Under bygge</strong><span>Den här fliken kommer i ett senare steg.</span></section>`;
    }
  }

  function tema() {
    try { return localStorage.getItem('kk_tema') || 'auto'; } catch (e) { return 'auto'; }
  }
  function sattTema(t) {
    try { localStorage.setItem('kk_tema', t); } catch (e) { /* */ }
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  function mer() {
    const t = tema();
    const knapp = (v, text) => `<button type="button" data-tema="${v}" aria-pressed="${t === v}">${text}</button>`;
    vy.innerHTML = `<header class="rubrik"><div><p class="overrad">Kammarkoll</p><h1>Mer</h1></div></header>
      <h2>Utseende</h2>
      <div class="tema glas" role="group" aria-label="Tema">${knapp('auto', 'Auto')}${knapp('ljust', 'Ljust')}${knapp('mörkt', 'Mörkt')}</div>
      <section class="info glas"><strong>Om datan</strong>
        <span>Källa: Sveriges riksdag, riksdagens öppna data. Dina röster sparas bara på den här telefonen.</span>
        ${data && data.genererad ? `<span>Uppdaterad ${new Date(data.genererad).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}</span>` : ''}
      </section>`;
    vy.querySelectorAll('[data-tema]').forEach(b => b.addEventListener('click', () => { sattTema(b.dataset.tema); mer(); }));
  }

  knappar.forEach(k => k.addEventListener('click', () => {
    if (k.dataset.flik === 'beslut' && flik === 'beslut') KKBeslut.aterstall();
    visa(k.dataset.flik);
  }));

  async function ladda() {
    try {
      const res = await KKData.hamtaIdag();
      data = res.data; offline = res.offline;
    } catch (e) {
      data = null;
      if (flik === 'beslut') {
        vy.innerHTML = '<section class="tom glas"><strong>Kunde inte hämta dagens beslut</strong><span>Kontrollera nätet och försök igen.</span></section>';
        return;
      }
    }
    visa(flik);
  }

  sattTema(tema());
  flik = lasFlik();
  visa(flik);
  ladda();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ladda(); });

  if ('serviceWorker' in navigator) {
    let laddarOm = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (laddarOm) return; laddarOm = true; location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(() => { /* */ });
  }
})();
