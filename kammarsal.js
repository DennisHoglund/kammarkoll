/* Ritar plenisalen (349 platser) som SVG, färgad efter ja/nej/avstår/frånvarande. */
(function () {
  'use strict';

  const PLATSER = 349;
  let layout = null;

  function platser() {
    if (layout) return layout;
    const rader = 10;
    const radier = Array.from({ length: rader }, (_, i) => 0.42 + 0.58 * i / (rader - 1));
    const summa = radier.reduce((a, b) => a + b, 0);
    const antal = radier.map(r => Math.round(PLATSER * r / summa));
    antal[rader - 1] += PLATSER - antal.reduce((a, b) => a + b, 0);
    const lista = [];
    radier.forEach((r, ri) => {
      const n = antal[ri];
      for (let i = 0; i < n; i++) {
        const v = Math.PI * (1 - i / (n - 1));
        lista.push({ v, r });
      }
    });
    lista.sort((a, b) => (b.v - a.v) || (a.r - b.r));
    layout = lista;
    return lista;
  }

  function svg(res) {
    const W = 330, R = 158, cx = W / 2, cy = R + 6, d = 4.4;
    const farger = [];
    const push = (n, f) => { for (let i = 0; i < (n || 0); i++) farger.push(f); };
    push(res.ja, 'var(--accent)');
    push(res.nej, 'var(--nej)');
    push(res.avstar, 'var(--text-3)');
    while (farger.length < PLATSER) farger.push('var(--franvarande)');
    const cirklar = platser().map((p, i) =>
      `<circle cx="${(cx + R * p.r * Math.cos(p.v)).toFixed(1)}" cy="${(cy - R * p.r * Math.sin(p.v)).toFixed(1)}" r="${d}" style="fill:${farger[i]}"></circle>`
    ).join('');
    const etikett = `${res.ja} ja, ${res.nej} nej, ${res.avstar || 0} avstår, ${res.franvarande || 0} frånvarande`;
    return `<svg role="img" aria-label="${etikett}" viewBox="0 0 ${W} ${Math.round(cy + 8)}">${cirklar}</svg>`;
  }

  window.KKSal = { svg };
})();
