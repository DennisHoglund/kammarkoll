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

/** Första stycket ur riksdagens notis (HTML) som ren text, max ~260 tecken. */
export function forstaStycke(html) {
  const forsta = String(html || '').split(/<\/p>|<ul>/i)[0];
  const text = forsta.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  // Stycket slutar ibland mitt i en mening före en punktlista – klipp då vid senaste meningsslut.
  if (text.length <= 260 && /[.!?…]$/.test(text)) return text;
  if (text.length <= 260) { const p = text.lastIndexOf('. '); return p > 20 ? text.slice(0, p + 1) : text; }
  const klipp = text.slice(0, 260);
  const punkt = klipp.lastIndexOf('. ');
  return punkt > 120 ? klipp.slice(0, punkt + 1) : klipp.replace(/\s+\S*$/, '') + '…';
}

/** Vad utskottet föreslår, utläst ur notisen ("…föreslår att riksdagen säger ja/nej…"). */
export function utskottetsForslag(html) {
  const t = String(html || '').toLowerCase();
  if (/föreslår att riksdagen säger ja/.test(t)) return 'ja';
  if (/föreslår att riksdagen säger nej/.test(t)) return 'nej';
  return null;
}

/** Plockar betänkanden ur ett dokumentlista-svar. */
export function parseBetankanden(json) {
  const dok = lista(json && json.dokumentlista && json.dokumentlista.dokument);
  return dok.map(d => ({
    id: d.dok_id || d.id,
    rm: d.rm,
    beteckning: d.beteckning,
    utskott: d.organ,
    titel: d.titel || d.notisrubrik || '',
    sammanfattning: forstaStycke(d.notis || d.summary || ''),
    utskottSager: utskottetsForslag(d.notis || d.summary || ''),
    reservationer: Number.isFinite(Number(d.reservationer)) ? Number(d.reservationer) : null,
    beslutsdag: dag(d.beslutsdag) || dag(d.beslutad),
    debattdag: dag(d.debattdag),
    url: d.dokument_url_html ? (String(d.dokument_url_html).startsWith('//') ? 'https:' + d.dokument_url_html : d.dokument_url_html) : null,
  })).filter(b => b.id && b.beteckning);
}

/** Räknar ihop första huvudvoteringen (sakfrågan) i ett voteringlista-svar. */
export function parseVotering(json) {
  const rader = lista(json && json.voteringlista && json.voteringlista.votering);
  if (!rader.length) return null;
  const huvud = rader.filter(r => !r.votering || r.votering === 'huvud');
  const sak = huvud.filter(r => !r.avser || String(r.avser).toLowerCase() === 'sakfrågan');
  const urval = sak.length ? sak : huvud.length ? huvud : rader;
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
  const tid = String(forsta.systemdatum || '').slice(11, 16);
  return {
    utfall: tot.ja > tot.nej ? 'ja' : 'nej',
    ...(tid ? { tid } : {}),
    ...tot,
    partier: Object.entries(per).map(([parti, v]) => ({ parti, ...v })).sort((a, b) => (b.ja + b.nej) - (a.ja + a.nej)),
  };
}

/** Tider för kammaren en viss dag ur kalender-API:et (org=kamm ger alla kommande händelser, filtreras här). */
export function parseKalender(json, datum) {
  const kod = datum.replaceAll('-', '');
  const poster = lista(json && json.kalenderlista && json.kalenderlista.kalender)
    .filter(k => String(k.DTSTART || '').startsWith(kod));
  const klocka = k => { const t = String(k.DTSTART).slice(9, 13); return t.length === 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : null; };
  const beslut = poster.find(k => /votering/i.test(k.CATEGORIES || '') || /^beslut/i.test(k.SUMMARY || ''));
  const debatt = poster.filter(k => /debatt/i.test(k.SUMMARY || '')).sort((a, b) => String(a.DTSTART).localeCompare(String(b.DTSTART)))[0];
  return { beslutstid: beslut ? klocka(beslut) : null, debattstart: debatt ? klocka(debatt) : null };
}

/** Kammarens program från en dag och `dagar` framåt, med ärendena som står i händelsens beskrivning. */
export function parseProgram(json, fran, dagar = 14) {
  const start = new Date(fran + 'T12:00:00Z');
  const slut = new Date(start.getTime() + dagar * 864e5).toISOString().slice(0, 10).replaceAll('-', '');
  const franKod = fran.replaceAll('-', '');
  const ut = [];
  for (const k of lista(json && json.kalenderlista && json.kalenderlista.kalender)) {
    const ds = String(k.DTSTART || '');
    const dkod = ds.slice(0, 8);
    if (dkod < franKod || dkod > slut) continue;
    const ingenTid = /ingen starttid/i.test(String(k.XRDDTSTARTSTATUS || ''));
    const t = ds.slice(9, 13);
    const beskr = [].concat(k.DESCRIPTION || []).join('\n').replace(/\\n/g, '\n');
    const arenden = [];
    for (const rad of beskr.split('\n')) {
      const m = rad.trim().match(/^(\d{4}\/\d{2}:\S+)\s+(.+)$/);
      if (m) arenden.push({ beteckning: m[1], titel: m[2].trim() });
    }
    ut.push({
      datum: `${dkod.slice(0, 4)}-${dkod.slice(4, 6)}-${dkod.slice(6, 8)}`,
      tid: !ingenTid && t.length === 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : null,
      titel: String(k.SUMMARY || '').trim(),
      typ: (String(k.CATEGORIES || '').split(',')[1] || '').trim().toLowerCase(),
      arenden,
      ...(k.XRDDOKID ? { dokid: String(k.XRDDOKID) } : {}),
    });
  }
  return ut.sort((a, b) => (a.datum + (a.tid || '99')).localeCompare(b.datum + (b.tid || '99')));
}

const avkoda = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&#xa0;|&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

/** Kammarens föredragningslista (HTML) → sektioner med numrerade punkter. */
export function parseForedragningslista(html) {
  const sektioner = [];
  let aktuell = null, grupp = null;
  for (const rad of String(html || '').match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []) {
    const celler = (rad.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []).map(avkoda);
    if (/class="HuvudrubrikEnsam"/.test(rad)) {
      aktuell = { rubrik: celler[1] || '', punkter: [] };
      grupp = null;
      sektioner.push(aktuell);
    } else if (/class="renderubrik"/.test(rad)) {
      grupp = celler[1] || null;
    } else if (/class="FlistaNrText"/.test(rad) && aktuell) {
      const text = celler[1] || '';
      const m = text.match(/^(?:Bet\.|Prop\.|Skr\.|Mot\.|Ip\.|Fr\.)?\s*(\d{4}\/\d{2}:[A-Za-zÅÄÖåäö]*\d+)\s+(.*)$/);
      aktuell.punkter.push({
        nr: Number(celler[0]) || null,
        text: m ? m[2] : text,
        ...(m ? { beteckning: m[1] } : {}),
        ...(celler[2] ? { info: celler[2] } : {}),
        ...(grupp ? { grupp } : {}),
      });
    }
  }
  return sektioner.filter(s => s.punkter.length);
}

/** Bygger appens format av dagens betänkanden + ev. voteringar. */
export function bygg(datum, betankanden, voteringar, kalender = {}) {
  const idag = betankanden.filter(b => b.beslutsdag === datum);
  const arenden = idag.map(b => {
    const res = voteringar[b.id] || null;
    return {
      id: b.id,
      beteckning: `${b.rm || ''}:${b.beteckning}`.replace(/^:/, ''),
      utskott: b.utskott,
      titel: b.titel,
      fraga: b.sammanfattning || b.titel,
      utskottSager: b.utskottSager,
      reservationer: b.reservationer,
      status: res ? 'beslutat' : 'kommande',
      ...(res ? { resultat: res } : {}),
      url: b.url,
    };
  });
  const framtid = [...new Set(betankanden.map(b => b.beslutsdag).filter(d => d && d > datum))].sort();
  const nasta = framtid.length
    ? { datum: framtid[0], tid: (kalender.nasta && kalender.nasta.beslutstid) || null, antal: betankanden.filter(b => b.beslutsdag === framtid[0]).length }
    : null;
  // Omstridda ärenden (flest reservationer) först.
  arenden.sort((a, b) => (b.reservationer || 0) - (a.reservationer || 0));
  return {
    genererad: new Date().toISOString(), datum, exempel: false,
    beslutstid: (kalender.idag && kalender.idag.beslutstid) || null,
    debattstart: (kalender.idag && kalender.idag.debattstart) || null,
    arenden, nasta,
    program: kalender.program || [],
    dagordning: kalender.dagordning || {},
  };
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

  let kalJson = null;
  try { kalJson = await hamtaJson(`${API}/kalender/?org=kamm&utformat=json&sz=500`); } catch (e) { console.warn('Kalender saknas:', e.message); }
  const framtid = [...new Set(betankanden.map(b => b.beslutsdag).filter(d => d && d > datum))].sort();
  const kalender = kalJson
    ? { idag: parseKalender(kalJson, datum), nasta: framtid[0] ? parseKalender(kalJson, framtid[0]) : null, program: parseProgram(kalJson, datum) }
    : {};
  // Föredragningslistor (dagordning) för dagar inom en vecka: kalenderhändelse → dokumentstatus → f-lista.
  kalender.dagordning = {};
  const vecka = new Date(new Date(datum + 'T12:00:00Z').getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const perDag = new Map();
  for (const h of kalender.program || []) if (h.dokid && h.datum <= vecka && !perDag.has(h.datum)) perDag.set(h.datum, h.dokid);
  for (const [dagen, dokid] of [...perDag].slice(0, 6)) {
    try {
      const st = await hamtaJson(`${API}/dokumentstatus/${encodeURIComponent(dokid)}.json`);
      const ref = lista(st && st.dokumentstatus && st.dokumentstatus.dokreferens && st.dokumentstatus.dokreferens.referens)
        .find(r => r.ref_dok_typ === 'f-lista');
      if (!ref) continue;
      const svar = await fetch(`${API}/dokument/${encodeURIComponent(ref.ref_dok_id)}.html`, { headers: { 'User-Agent': 'Kammarkoll' } });
      if (!svar.ok) continue;
      const sektioner = parseForedragningslista(await svar.text());
      if (sektioner.length) kalender.dagordning[dagen] = { id: ref.ref_dok_id, titel: ref.uppgift || '', sektioner };
    } catch (e) { console.warn('Dagordning saknas för', dagen, e.message); }
  }
  console.log('Kalender:', JSON.stringify({ idag: kalender.idag, nasta: kalender.nasta, program: (kalender.program || []).length + ' händelser', dagordning: Object.keys(kalender.dagordning) }));

  const ut = bygg(datum, betankanden, voteringar, kalender);
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
