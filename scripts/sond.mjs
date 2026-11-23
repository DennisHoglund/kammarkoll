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

// Kalender: prova några URL-varianter
for (const u of [
  `${API}/kalender/?org=kamm&from=${dag}&tom=${dag}&utformat=json`,
  `${API}/kalender/?akt=bes&from=${dag}&tom=${dag}&utformat=json`,
  `${API}/kalender/?org=kamm&from=${dag}&tom=${dag}&utformat=xml`,
  `${API}/kalender/?org=kamm&from=${dag}&tom=${dag}&utformat=icalendar`,
]) {
  const k = await get(u, u.includes('json'));
  if (k) console.log(kort(JSON.stringify(k), 2500));
}

// Votering från förra riksmötet som referens för fältnamn
const v = await get(`${API}/voteringlista/?rm=2025%2F26&bet=SkU8&utformat=json&sz=5`);
if (v) console.log(kort(JSON.stringify(v), 2000));
const v2 = await get(`${API}/voteringlista/?rm=2025%2F26&utformat=json&sz=3`);
if (v2) console.log(kort(JSON.stringify(v2), 2000));

// Kalender del 2: filtrera själv på datum
const kal = await get(`${API}/kalender/?org=kamm&utformat=json&sz=500`);
const alla = [].concat(kal?.kalenderlista?.kalender || []);
const datumKod = dag.replaceAll('-', '');
console.log(`\nKalender totalt ${alla.length}, DTSTART-intervall ${alla.map(k => k.DTSTART).sort()[0]} – ${alla.map(k => k.DTSTART).sort().at(-1)}`);
for (const k of alla.filter(k => String(k.DTSTART).startsWith(datumKod)))
  console.log(`  ${k.DTSTART} ${k.SUMMARY} | ${k.CATEGORIES} | ${k.XRDDTSTARTSTATUS} | ${k.XRDDOKID} | ${kort(JSON.stringify(k.DESCRIPTION), 1500)}`);
for (const u of [`${API}/kalender/?org=kamm&datum=${dag}&utformat=json`, `${API}/kalender/?org=kamm&fdatum=${dag}&tdatum=${dag}&utformat=json`, `${API}/kalender/?org=kamm&from=${dag}&tom=${dag}&utformat=json&sz=500&sort=c`]) {
  const r = await get(u);
  const l = [].concat(r?.kalenderlista?.kalender || []);
  console.log(`  ${l.length} poster, första ${l[0]?.DTSTART} ${l[0]?.SUMMARY}`);
}

// Föredragningslista via XRDDOKID
for (const k of alla.filter(k => String(k.DTSTART).startsWith(datumKod) && k.XRDDOKID)) {
  const id = k.XRDDOKID;
  const st = await get(`${API}/dokumentstatus/${id}.json`);
  if (st) console.log(kort(JSON.stringify(st), 3000));
  await get(`${API}/dokument/${id}.text`, false);
  await get(`${API}/dokument/${id}.html`, false);
}

// Själva föredragningslistan
const fl = await get(`${API}/dokumentstatus/HE0I20.json`);
if (fl) console.log('FL-NYCKLAR', Object.keys(fl.dokumentstatus || {}), kort(JSON.stringify(fl.dokumentstatus?.dokument), 600));
const flh = await (await fetch(`${API}/dokument/HE0I20.html`, H)).text();
console.log('FL-HTML', flh.length, kort(flh.replace(/<style[\s\S]*?<\/style>/g, ''), 4000));
