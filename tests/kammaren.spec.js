// @ts-check
const { test, expect } = require('@playwright/test');

const PROGRAM = [
  { datum: '2026-11-25', tid: '09:00', titel: 'Debatt om förslag', typ: 'arbetsplenum', arenden: [
    { beteckning: '2026/27:A1', titel: 'Ärende ett' }, { beteckning: '2026/27:A2', titel: 'Ärende två' },
    { beteckning: '2026/27:A3', titel: 'Ärende tre' }, { beteckning: '2026/27:A4', titel: 'Ärende fyra' }, { beteckning: '2026/27:A5', titel: 'Ärende fem' }] },
  { datum: '2026-11-25', tid: '16:00', titel: 'Beslut', typ: 'votering', arenden: [{ beteckning: '2026/27:B1', titel: 'Beslutsärende' }] },
  { datum: '2026-11-26', tid: '14:00', titel: 'Frågestund', typ: 'frågestund', arenden: [] },
  { datum: '2026-12-01', tid: null, titel: 'Bordläggning', typ: 'bordläggning', arenden: [] },
];
PROGRAM.splice(2, 0, { datum: '2026-11-26', tid: '11:00', titel: 'Bordläggning', typ: 'bordläggningsplenum', arenden: [] });
const DAGORDNING = { '2026-11-26': { id: 'X1', titel: 'föredragningslista', sektioner: [
  { rubrik: 'Justering av protokoll', punkter: [{ nr: 1, text: 'Justering av protokoll från sammanträdet' }] },
  { rubrik: 'Ärenden för bordläggning', punkter: [
    { nr: 6, text: 'Stärkt trygghet i bostadsrätter', beteckning: '2026/27:CU2', info: '2 res. (P1, P2)', grupp: 'Civilutskottets betänkanden' },
    { nr: 7, text: 'Bygglov', beteckning: '2026/27:CU3', grupp: 'Civilutskottets betänkanden' }] },
] } };
const DATA = { genererad: '2026-11-25T06:00:00+01:00', datum: '2026-11-25', exempel: false, beslutstid: '16:00', arenden: [], nasta: null, program: PROGRAM, dagordning: DAGORDNING };

async function oppna(page, tid, flik) {
  await page.clock.setFixedTime(new Date(tid));
  await page.route('**/data/idag.json', r => r.fulfill({ json: DATA }));
  await page.goto('/');
  await page.getByRole('button', { name: flik }).click();
}

test('kammaren: pågående debatt markeras live med ärenden', async ({ page }) => {
  await oppna(page, '2026-11-25T10:30:00+01:00', 'Kammaren');
  const nu = page.getByTestId('nu-kort');
  await expect(nu).toContainText('PÅGÅR NU');
  await expect(nu).toContainText('Debatt om förslag');
  await expect(nu).toContainText('Ärende fyra');
  await expect(nu).toContainText('+ 1 till');
  await expect(nu.getByRole('link', { name: 'Titta live' })).toHaveAttribute('href', /webb-tv/);
  await expect(page.getByTestId('idag').locator('.prog-rad.nu')).toContainText('Debatt om förslag');
});

test('kammaren: före start visas nästa händelse', async ({ page }) => {
  await oppna(page, '2026-11-25T08:00:00+01:00', 'Kammaren');
  await expect(page.getByTestId('nu-kort')).toContainText('Nästa · 09:00');
});

test('kammaren: tom dag visar nästa sammanträde', async ({ page }) => {
  await oppna(page, '2026-11-28T12:00:00+01:00', 'Kammaren');
  await expect(page.getByTestId('tom-kammare')).toContainText('tisdag 1 dec');
});

test('kalender: dagväljare byter program och visar ärenden', async ({ page }) => {
  await oppna(page, '2026-11-25T08:00:00+01:00', 'Kalender');
  const dagar = page.getByTestId('dagar').getByRole('button');
  await expect(dagar).toHaveCount(3);
  await expect(page.getByTestId('dagens-program')).toContainText('Debatt om förslag');
  await page.getByRole('button', { name: 'torsdag 26 nov' }).click();
  await expect(page.getByTestId('dagens-program')).toContainText('Frågestund');
  await expect(page.getByRole('button', { name: 'torsdag 26 nov' })).toHaveAttribute('aria-pressed', 'true');
});

test('bordläggning: raden fälls ut med förklaring och dagordningen visas', async ({ page }) => {
  await oppna(page, '2026-11-26T10:00:00+01:00', 'Kammaren');
  const rad = page.getByTestId('idag').locator('summary', { hasText: 'Bordläggning' });
  await rad.click();
  await expect(page.getByText('läggs på bordet')).toBeVisible();
  const dag = page.getByTestId('dagordning');
  await dag.locator('summary', { hasText: 'Ärenden för bordläggning' }).click();
  await expect(dag).toContainText('Civilutskottets betänkanden');
  await expect(dag).toContainText('Stärkt trygghet i bostadsrätter');
  await expect(dag).toContainText('2026/27:CU2 · 2 res. (P1, P2)');
});

test('skärmdump kammaren', async ({ page }, info) => {
  await oppna(page, '2026-11-25T10:30:00+01:00', 'Kammaren');
  await page.screenshot({ path: `test-results/bilder/${info.project.name}-3-kammaren.png` });
  await page.getByRole('button', { name: 'Kalender' }).click();
  await page.screenshot({ path: `test-results/bilder/${info.project.name}-4-kalender.png` });
});
