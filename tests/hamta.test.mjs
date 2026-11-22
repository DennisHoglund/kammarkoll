import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idagStockholm, riksmote, parseBetankanden, parseVotering, bygg } from '../scripts/hamta.mjs';

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
      { dok_id: 'HE01TU1', rm: '2026/27', beteckning: 'TU1', organ: 'TU', titel: 'Laddning', notis: 'Kort om laddning', beslutsdag: '2026-11-25', dokument_url_html: '//data.riksdagen.se/dokument/HE01TU1.html' },
      { dok_id: 'HE01CU2', rm: '2026/27', beteckning: 'CU2', organ: 'CU', titel: 'Bostad', beslutsdag: '2026-11-25' },
      { dok_id: 'HE01KU3', rm: '2026/27', beteckning: 'KU3', organ: 'KU', titel: 'Grundlag', beslutsdag: '2026-11-26' },
    ],
  },
};

test('betänkanden parsas och url får https', () => {
  const b = parseBetankanden(dokSvar);
  assert.equal(b.length, 3);
  assert.equal(b[0].url, 'https://data.riksdagen.se/dokument/HE01TU1.html');
  assert.equal(b[0].utskott, 'TU');
});

test('ett enda dokument (inte lista) hanteras', () => {
  const b = parseBetankanden({ dokumentlista: { dokument: dokSvar.dokumentlista.dokument[0] } });
  assert.equal(b.length, 1);
});

test('votering: första punkten i sakfrågan räknas, per parti', () => {
  const rad = (punkt, id, parti, rost, avser = 'sakfrågan') => ({ punkt, votering_id: id, parti, rost, avser });
  const svar = {
    voteringlista: {
      votering: [
        rad('2', 'B', 'P1', 'Nej'),
        rad('1', 'A', 'P1', 'Ja'), rad('1', 'A', 'P1', 'Ja'), rad('1', 'A', 'P2', 'Nej'),
        rad('1', 'A', 'P2', 'Avstår'), rad('1', 'A', 'P2', 'Frånvarande'),
        rad('1', 'M', 'P2', 'Nej', 'motivfrågan'),
      ],
    },
  };
  const r = parseVotering(svar);
  assert.deepEqual([r.ja, r.nej, r.avstar, r.franvarande], [2, 1, 1, 1]);
  assert.equal(r.utfall, 'ja');
  assert.equal(r.partier.find(p => p.parti === 'P1').ja, 2);
});

test('tom votering ger null', () => {
  assert.equal(parseVotering({ voteringlista: {} }), null);
});

test('bygg: dagens ärenden, status och nästa beslutsdag', () => {
  const b = parseBetankanden(dokSvar);
  const ut = bygg('2026-11-25', b, { HE01TU1: { utfall: 'nej', ja: 1, nej: 2, avstar: 0, franvarande: 0, partier: [] } });
  assert.equal(ut.arenden.length, 2);
  assert.equal(ut.arenden[0].status, 'beslutat');
  assert.equal(ut.arenden[1].status, 'kommande');
  assert.equal(ut.arenden[0].beteckning, '2026/27:TU1');
  assert.deepEqual(ut.nasta, { datum: '2026-11-26', antal: 1 });
  assert.equal(ut.exempel, false);
});
