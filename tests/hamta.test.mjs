import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idagStockholm, riksmote, parseBetankanden, parseVotering, parseKalender, parseProgram, forstaStycke, utskottetsForslag, bygg } from '../scripts/hamta.mjs';

test('datum i svensk tid', () => {
  assert.equal(idagStockholm(new Date('2026-11-24T23:30:00Z')), '2026-11-25');
});

test('riksmöte från datum', () => {
  assert.equal(riksmote('2026-11-25'), '2026/27');
  assert.equal(riksmote('2027-03-10'), '2026/27');
  assert.equal(riksmote('2026-08-31'), '2025/26');
});

const dokSvar = {
  dokumentlista: {
    dokument: [
      { dok_id: 'HE01TU1', rm: '2026/27', beteckning: 'TU1', organ: 'TU', titel: 'Laddning', notis: '<p>Kort om laddning. Utskottet föreslår att riksdagen säger nej till motionerna.</p> <p>Mer text.</p>', reservationer: '0', beslutsdag: '2026-11-25', dokument_url_html: '//data.riksdagen.se/dokument/HE01TU1.html' },
      { dok_id: 'HE01CU2', rm: '2026/27', beteckning: 'CU2', organ: 'CU', titel: 'Bostad', reservationer: '2', beslutsdag: '2026-11-25' },
      { dok_id: 'HE01SkU9', rm: '2026/27', beteckning: 'SkU9', organ: 'SkU', titel: 'Ej satt', beslutsdag: '0' },
      { dok_id: 'HE01KU3', rm: '2026/27', beteckning: 'KU3', organ: 'KU', titel: 'Grundlag', beslutsdag: '2026-11-26' },
    ],
  },
};

test('betänkanden parsas och url får https', () => {
  const b = parseBetankanden(dokSvar);
  assert.equal(b.length, 4);
  assert.equal(b[0].url, 'https://data.riksdagen.se/dokument/HE01TU1.html');
  assert.equal(b[0].utskott, 'TU');
  assert.equal(b[0].sammanfattning, 'Kort om laddning. Utskottet föreslår att riksdagen säger nej till motionerna.');
  assert.equal(b[0].utskottSager, 'nej');
  assert.equal(b[0].reservationer, 0);
  assert.equal(b[1].reservationer, 2);
});

test('ett enda dokument (inte lista) hanteras', () => {
  const b = parseBetankanden({ dokumentlista: { dokument: dokSvar.dokumentlista.dokument[0] } });
  assert.equal(b.length, 1);
});

test('votering: första punkten i sakfrågan räknas, per parti', () => {
  const rad = (punkt, id, parti, rost, avser = 'sakfrågan', votering = 'huvud') => ({ punkt, votering_id: id, parti, rost, avser, votering, systemdatum: '2026-11-25 16:03:10' });
  const svar = {
    voteringlista: {
      votering: [
        rad('2', 'B', 'P1', 'Nej'),
        rad('1', 'A', 'P1', 'Ja'), rad('1', 'A', 'P1', 'Ja'), rad('1', 'A', 'P2', 'Nej'),
        rad('1', 'A', 'P2', 'Avstår'), rad('1', 'A', 'P2', 'Frånvarande'),
        rad('1', 'M', 'P2', 'Nej', 'motivfrågan'),
        rad('1', 'K', 'P2', 'Nej', 'sakfrågan', 'kvittning'),
      ],
    },
  };
  const r = parseVotering(svar);
  assert.deepEqual([r.ja, r.nej, r.avstar, r.franvarande], [2, 1, 1, 1]);
  assert.equal(r.utfall, 'ja');
  assert.equal(r.tid, '16:03');
  assert.equal(r.partier.find(p => p.parti === 'P1').ja, 2);
});

test('tom votering ger null', () => {
  assert.equal(parseVotering({ voteringlista: {} }), null);
});

test('bygg: dagens ärenden, status och nästa beslutsdag', () => {
  const b = parseBetankanden(dokSvar);
  const ut = bygg('2026-11-25', b, { HE01TU1: { utfall: 'nej', ja: 1, nej: 2, avstar: 0, franvarande: 0, partier: [] } });
  assert.equal(ut.arenden.length, 2);
  // omstridda först
  assert.equal(ut.arenden[0].id, 'HE01CU2');
  assert.equal(ut.arenden[0].status, 'kommande');
  assert.equal(ut.arenden[1].status, 'beslutat');
  assert.equal(ut.arenden[1].beteckning, '2026/27:TU1');
  assert.equal(ut.arenden[1].utskottSager, 'nej');
  assert.deepEqual(ut.nasta, { datum: '2026-11-26', tid: null, antal: 1 });
  assert.equal(ut.exempel, false);
});

test('kalender: beslutstid och debattstart för en dag', () => {
  const kal = { kalenderlista: { kalender: [
    { DTSTART: '20261125T160000', SUMMARY: 'Beslut', CATEGORIES: 'kammaren,votering,Debatt och beslut,kamm' },
    { DTSTART: '20261125T090000', SUMMARY: 'Debatt om förslag', CATEGORIES: 'kammaren,arbetsplenum,Debatt och beslut,kamm' },
    { DTSTART: '20261126T160000', SUMMARY: 'Beslut', CATEGORIES: 'kammaren,votering,kamm' },
  ] } };
  assert.deepEqual(parseKalender(kal, '2026-11-25'), { beslutstid: '16:00', debattstart: '09:00' });
  assert.deepEqual(parseKalender(kal, '2026-11-27'), { beslutstid: null, debattstart: null });
});

test('bygg: kalendertider följer med', () => {
  const ut = bygg('2026-11-25', parseBetankanden(dokSvar), {}, { idag: { beslutstid: '16:00', debattstart: '09:00' }, nasta: { beslutstid: '15:00' } });
  assert.equal(ut.beslutstid, '16:00');
  assert.equal(ut.debattstart, '09:00');
  assert.equal(ut.nasta.tid, '15:00');
});

test('första stycket kortas vid meningsslut', () => {
  const lang = '<p>' + 'Det här är en mening om något viktigt. '.repeat(12) + '</p>';
  const t = forstaStycke(lang);
  assert.ok(t.length <= 260 && t.endsWith('.'));
  assert.equal(forstaStycke('<p>Kort.</p><ul><li>x</li></ul>'), 'Kort.');
  assert.equal(forstaStycke('<p>Utskottet föreslår ja till avtalet. Det nya avtalet syftar till att</p> <ul><li>a</li></ul>'), 'Utskottet föreslår ja till avtalet.');
});

test('utskottets förslag tolkas ur notisen', () => {
  assert.equal(utskottetsForslag('<p>Skatteutskottet föreslår att riksdagen säger ja till regeringens förslag.</p>'), 'ja');
  assert.equal(utskottetsForslag('Skrivelsen har behandlats'), null);
});

test('program: 14 dagar framåt, tider, ärenden ur beskrivningen', () => {
  const kal = { kalenderlista: { kalender: [
    { DTSTART: '20261125T160000', SUMMARY: 'Beslut', CATEGORIES: 'kammaren,votering,Debatt och beslut,kamm',
      DESCRIPTION: ['', '\\n2026/27:CU2 Stärkt trygghet i bostadsrätter\\n\\n2026/27:CU3 Bygglov\\n'] },
    { DTSTART: '20261125T090000', SUMMARY: 'Debatt om förslag', CATEGORIES: 'kammaren,arbetsplenum,kamm', DESCRIPTION: ['', ''] },
    { DTSTART: '20261127T090000', SUMMARY: 'Avslutning', CATEGORIES: 'kammaren,avslutning,kamm', XRDDTSTARTSTATUS: 'Ingen starttid' },
    { DTSTART: '20261124T090000', SUMMARY: 'Igår', CATEGORIES: 'kammaren,x' },
    { DTSTART: '20270101T090000', SUMMARY: 'För långt bort', CATEGORIES: 'kammaren,x' },
  ] } };
  const p = parseProgram(kal, '2026-11-25');
  assert.deepEqual(p.map(h => `${h.datum} ${h.tid} ${h.titel}`), ['2026-11-25 09:00 Debatt om förslag', '2026-11-25 16:00 Beslut', '2026-11-27 null Avslutning']);
  assert.equal(p[1].typ, 'votering');
  assert.deepEqual(p[1].arenden, [{ beteckning: '2026/27:CU2', titel: 'Stärkt trygghet i bostadsrätter' }, { beteckning: '2026/27:CU3', titel: 'Bygglov' }]);
});
