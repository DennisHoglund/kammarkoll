// Tillfällig sond: skriver ut hur riksdagens API faktiskt svarar, så parsningen kan anpassas. Körs manuellt i CI.
const API = 'https://data.riksdagen.se';
const H = { headers: { 'User-Agent': 'Kammarkoll-sond' } };
const kort = (s, n = 300) => String(s == null ? '' : s).replace(/\s+/g, ' ').slice(0, n);

async function get(url, json = true) {
  try {
    const r = await fetch(url, H);
    const text = await r.text();
    console.log(`\n=== ${r.status} ${url}\n${r.headers.get('content-type')}  ${text.length} tecken  CORS: ${r.headers.get('access-control-allow-origin')}`);
    if (!json) { console.log(kort(text, 1500)); return null; }
    try { return JSON.parse(text); } catch { console.log('Inte JSON:', kort(text, 600)); return null; }
  } catch (e) { console.log('\n=== FEL', url, e.message); return null; }
}

const dag = process.env.SOND_DAG || '2026-11-25';
const d = await get(`${API}/dokumentlista/?doktyp=bet&rm=2026%2F27&utformat=json&sz=400&sort=datum&sortorder=desc`);
const dok = [].concat(d?.dokumentlista?.dokument || []).filter(x => String(x.beslutsdag).startsWith(dag));
console.log(`\n${dok.length} betänkanden med beslutsdag ${dag}`);
for (const x of dok.slice(0, 17)) {
  console.log(`\n--- ${x.beteckning} (${x.organ}) ${kort(x.titel, 90)}`);
  for (const f of ['beslutsdag', 'debattdag', 'beslutad', 'klockslag', 'datum', 'reservationer', 'debattnamn', 'debattsekunder', 'status', 'notisrubrik', 'summary']) {
    console.log(`  ${f}: ${kort(typeof x[f] === 'object' ? JSON.stringify(x[f]) : x[f], 200)}`);
  }
  console.log(`  notis (${String(x.notis || '').length} tecken): ${kort(x.notis, 400)}`);
}

// Voteringar per betänkande: sammanställ varje votering_id (punkt, avser, votering, röster, tid).
for (const x of dok) {
  const v = await get(`${API}/voteringlista/?rm=${encodeURIComponent(x.rm)}&bet=${encodeURIComponent(x.beteckning)}&utformat=json&sz=5000`);
  const rader = [].concat(v?.voteringlista?.votering || []);
  console.log(`VOT ${x.beteckning}: ${rader.length} rader, @antal=${v?.voteringlista?.['@antal']}`);
  if (rader[0]) console.log(`VOT-FÄLT ${Object.keys(rader[0]).join(',')}`);
  const per = {};
  for (const r of rader) {
    const k = r.votering_id;
    const p = (per[k] = per[k] || { punkt: r.punkt, punkttyp: r.punkttyp, avser: r.avser, votering: r.votering, tid: r.systemdatum, roster: {}, partier: {} });
    p.roster[r.rost] = (p.roster[r.rost] || 0) + 1;
    const pp = (p.partier[r.parti] = p.partier[r.parti] || {});
    pp[r.rost] = (pp[r.rost] || 0) + 1;
  }
  for (const [id, p] of Object.entries(per)) {
    console.log(`VOT ${x.beteckning} punkt=${p.punkt} typ=${p.punkttyp} avser=${p.avser} votering=${p.votering} tid=${p.tid} id=${id.slice(0, 8)} röster=${JSON.stringify(p.roster)}`);
    console.log(`VOT-PARTI ${x.beteckning} punkt=${p.punkt} ${JSON.stringify(p.partier)}`);
  }
}
