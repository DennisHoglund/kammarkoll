/* Data: hämtar data/idag.json (byggd av GitHub Action), cachar för offline, sparar användarens röster lokalt. */
(function () {
  'use strict';

  const CACHE_NYCKEL = 'kk_idag';
  const ROST_PREFIX = 'kk_roster_';

  function lasLokalt(nyckel) {
    try { return JSON.parse(localStorage.getItem(nyckel)); } catch (e) { return null; }
  }
  function sparaLokalt(nyckel, varde) {
    try { localStorage.setItem(nyckel, JSON.stringify(varde)); } catch (e) { /* privat läge */ }
  }

  async function hamtaIdag() {
    try {
      const svar = await fetch('data/idag.json', { cache: 'no-store' });
      if (!svar.ok) throw new Error('HTTP ' + svar.status);
      const data = await svar.json();
      sparaLokalt(CACHE_NYCKEL, data);
      return { data, offline: false };
    } catch (e) {
      const cachad = lasLokalt(CACHE_NYCKEL);
      if (cachad) return { data: cachad, offline: true };
      throw e;
    }
  }

  function roster(datum) {
    return lasLokalt(ROST_PREFIX + datum) || {};
  }
  function rosta(datum, arendeId, val) {
    const r = roster(datum);
    r[arendeId] = val;
    sparaLokalt(ROST_PREFIX + datum, r);
    return r;
  }

  const UTSKOTT = {
    AU: ['Arbetsmarknadsutskottet', '#7A4E12'],
    CU: ['Civilutskottet', '#9A3B12'],
    FiU: ['Finansutskottet', '#1E5A3A'],
    'FöU': ['Försvarsutskottet', '#3B4A5C'],
    JuU: ['Justitieutskottet', '#4B2F6B'],
    KU: ['Konstitutionsutskottet', '#2A3F7A'],
    KrU: ['Kulturutskottet', '#5B2A86'],
    MJU: ['Miljö- och jordbruksutskottet', '#2E6B2F'],
    NU: ['Näringsutskottet', '#8A5A00'],
    SfU: ['Socialförsäkringsutskottet', '#7A2E4C'],
    SkU: ['Skatteutskottet', '#334E68'],
    SoU: ['Socialutskottet', '#8C2F39'],
    TU: ['Trafikutskottet', '#0F5E59'],
    UbU: ['Utbildningsutskottet', '#1F4FA8'],
    UU: ['Utrikesutskottet', '#24527A'],
  };
  function utskott(kod) {
    const u = UTSKOTT[kod];
    return u ? { namn: u[0], farg: u[1] } : { namn: kod || 'Kammaren', farg: '#3A3F4B' };
  }

  window.KKData = { hamtaIdag, roster, rosta, utskott };
})();
