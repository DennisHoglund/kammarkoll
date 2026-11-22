// Hämtar dagens beslut från riksdagens öppna data och skriver data/idag.json.
// Körs av GitHub Actions (cron). Appen läser bara den färdiga filen – inga CORS-problem, ingen last på API:et från telefoner.
//
// ATT VERIFIERA mot riktiga svar (se SPEC.md): fältnamnen i dokumentlista (beslutsdag/debattdag, organ, beteckning)
// och voteringlista (votering_id, punkt, rost, avser). Parsningen är tolerant och loggar vad den hittar.

import { writeFile, mkdir } from 'node:fs/promises';

const API = 'https://data.riksdagen.se';

export function idagStockholm(nu = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(nu); // ÅÅÅÅ-MM-DD
}

export function riksmote(datum) {
  const [y, m] = datum.split('-').map(Number);
  const start = m >= 9 ? y : y - 1; // riksmötet börjar på hösten
  return `${start}/${String(start + 1).slice(2)}`;
}

const lista = v => (Array.isArray(v) ? v : v ? [v] : []);
const dag = v => (typeof v === 'string' ? v.slice(0, 10) : '');

/** Plockar betänkanden ur ett dokumentlista-svar. */
export function parseBetankanden(json) {
  const dok = lista(json && json.dokumentlista && json.dokumentlista.dokument);
  return dok.map(d => ({
    id: d.dok_id || d.id,
    rm: d.rm,
    beteckning: d.beteckning,
    utskott: d.organ,
    titel: d.titel || d.notisrubrik || '',
    sammanfattning: d.notis || d.summary || '',
    beslutsdag: dag(d.beslutsdag) || dag(d.beslutad),
    debattdag: dag(d.debattdag),
    url: d.dokument_url_html ? (String(d.dokument_url_html).startsWith('//') ? 'https:' + d.dokument_url_html : d.dokument_url_html) : null,
  })).filter(b => b.id && b.beteckning);
}

/** Räknar ihop första huvudvoteringen (sakfrågan) i ett voteringlista-svar. */
export function parseVotering(json) {
  const rader = lista(json && json.voteringlista && json.voteringlista.votering);
  if (!rader.length) return null;
  const sak = rader.filter(r => !r.avser || String(r.avser).toLowerCase() === 'sakfrågan');
  const urval = sak.length ? sak : rader;
  const forsta = [...urval].sort((a, b) => Number(a.punkt) - Number(b.punkt))[0];
  const rows = urval.filter(r => r.votering_id === forsta.votering_id);
  const tom = () => ({ ja: 0, nej: 0, avstar: 0, franvarande: 0 });
  const tot = tom();
  const per = {};
  for (const r of rows) {
    const rost = String(r.rost || '').toLowerCase();
    const k = rost === 'ja' ? 'ja' : rost === 'nej' ? 'nej' : rost.startsWith('avst') ? 'avstar' : 'franvarande';
    tot[k]++;
    const p = (r.parti || '–').toUpperCase();
    (per[p] = per[p] || tom())[k]++;
  }
  return {
    utfall: tot.ja > tot.nej ? 'ja' : 'nej',
    ...tot,
    partier: Object.entries(per).map(([parti, v]) => ({ parti, ...v })).sort((a, b) => (b.ja + b.nej) - (a.ja + a.nej)),
  };
}

/** Bygger appens format av dagens betänkanden + ev. voteringar. */
export function bygg(datum, betankanden, voteringar) {
  const idag = betankanden.filter(b => b.beslutsdag === datum);
  const arenden = idag.map(b => {
    const res = voteringar[b.id] || null;
    return {
      id: b.id,
      beteckning: `${b.rm || ''}:${b.beteckning}`.replace(/^:/, ''),
      utskott: b.utskott,
      titel: b.titel,
      fraga: b.sammanfattning || b.titel,
      status: res ? 'beslutat' : 'kommande',
      ...(res ? { resultat: res } : {}),
      url: b.url,
    };
  });
  const framtid = [...new Set(betankanden.map(b => b.beslutsdag).filter(d => d && d > datum))].sort();
  const nasta = framtid.length ? { datum: framtid[0], antal: betankanden.filter(b => b.beslutsdag === framtid[0]).length } : null;
  return { genererad: new Date().toISOString(), datum, exempel: false, beslutstid: null, arenden, nasta };
}

async function hamtaJson(url) {
  const svar = await fetch(url, { headers: { 'User-Agent': 'Kammarkoll (github.com/DennisHoglund/kammarkoll)' } });
  if (!svar.ok) throw new Error(`${svar.status} ${url}`);
  return svar.json();
}

async function main() {
  const datum = process.env.KK_DATUM || idagStockholm();
  const rm = riksmote(datum);
  const rmQ = encodeURIComponent(rm);
  const dokUrl = `${API}/dokumentlista/?doktyp=bet&rm=${rmQ}&utformat=json&sz=400&sort=datum&sortorder=desc`;
  console.log('Hämtar', dokUrl);
  const dokJson = await hamtaJson(dokUrl);
  const forsta = lista(dokJson && dokJson.dokumentlista && dokJson.dokumentlista.dokument)[0];
  if (forsta) console.log('Fält i första betänkandet:', Object.keys(forsta).join(', '));
  const betankanden = parseBetankanden(dokJson);
  console.log('Med beslutsdag:', betankanden.filter(b => b.beslutsdag).length, '– exempel:', betankanden.slice(0, 3).map(b => `${b.beteckning}=${b.beslutsdag || '?'}`).join(' '));
  console.log(`${betankanden.length} betänkanden, ${betankanden.filter(b => b.beslutsdag === datum).length} med beslut ${datum}`);

  const voteringar = {};
  for (const b of betankanden.filter(x => x.beslutsdag === datum)) {
    const url = `${API}/voteringlista/?rm=${encodeURIComponent(b.rm || rm)}&bet=${encodeURIComponent(b.beteckning)}&utformat=json&sz=2000`;
    try {
      const res = parseVotering(await hamtaJson(url));
      if (res) voteringar[b.id] = res;
    } catch (e) {
      console.warn('Votering saknas/fel för', b.beteckning, e.message);
    }
  }

  const ut = bygg(datum, betankanden, voteringar);
  await mkdir('data', { recursive: true });
  await writeFile('data/idag.json', JSON.stringify(ut, null, 2));
  console.log(`Skrev data/idag.json: ${ut.arenden.length} ärenden, ${Object.keys(voteringar).length} beslutade, nästa: ${JSON.stringify(ut.nasta)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    // Behåll befintlig fil (exempeldata eller senaste) – sidan ska ändå kunna deployas.
    console.error('::warning::Kunde inte hämta från riksdagen:', e.message);
    process.exitCode = 0;
  });
}
