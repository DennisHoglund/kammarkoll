// @ts-check
const { test, expect } = require('@playwright/test');

const DAG = {
  genererad: '2026-11-25T06:00:00+01:00',
  datum: '2026-11-25',
  exempel: false,
  beslutstid: '16:00',
  arenden: [
    { id: 'a1', beteckning: '2026/27:TU1', utskott: 'TU', titel: 'Laddning vid rastplatser', fraga: 'Ska staten bygga laddning?', utskottSager: 'nej', reservationer: 4, status: 'beslutat',
      resultat: { utfall: 'nej', tid: '16:03', punkt: 2, voteringar: 2, ja: 150, nej: 175, avstar: 0, franvarande: 24, partier: [{ parti: 'P1', ja: 100, nej: 0, avstar: 0, franvarande: 10 }, { parti: 'P2', ja: 50, nej: 175, avstar: 0, franvarande: 14 }] } },
    { id: 'a2', beteckning: '2026/27:UbU1', utskott: 'UbU', titel: 'Mobilfri skoldag', fraga: 'Ska mobiler samlas in?', reservationer: 1, status: 'beslutat',
      resultat: { utfall: 'ja', ja: 175, nej: 150, avstar: 0, franvarande: 24 } },
    { id: 'a3', beteckning: '2026/27:CU1', utskott: 'CU', titel: 'Kontantinsats', fraga: 'Ska staten gå i borgen?', status: 'kommande' },
    { id: 'a4', beteckning: '2026/27:SkU6', utskott: 'SkU', titel: 'Skatteavtal med P-land', fraga: 'Nytt skatteavtal.', reservationer: 0, status: 'beslutat',
      resultat: { utfall: 'ja', ja: 300, nej: 0, avstar: 0, franvarande: 49 } },
  ],
  nasta: { datum: '2026-11-26', tid: '16:00', antal: 3 },
};

async function oppna(page, data = DAG) {
  await page.route('**/data/idag.json', r => r.fulfill({ json: data }));
  await page.goto('/');
}

test('visar första ärendet med fråga och röstknappar', async ({ page }) => {
  await oppna(page);
  const kort = page.getByTestId('arendekort');
  await expect(kort).toContainText('Laddning vid rastplatser');
  await expect(kort).toContainText('Trafikutskottet');
  await expect(kort).toContainText('Ska staten bygga laddning?');
  await expect(page.getByTestId('position')).toHaveText('1 av 3');
  await expect(page.getByRole('button', { name: 'Ja' })).toBeVisible();
  await expect(page.getByTestId('omstritt')).toHaveText('Omstritt · 4 reservationer');
});

test('eniga ärenden röstas inte om men visas i sammanfattningen', async ({ page }) => {
  await oppna(page);
  for (const val of ['Ja', 'Nej']) {
    await page.getByRole('button', { name: val }).click();
    await page.getByRole('button', { name: 'Tillbaka' }).click();
  }
  await page.getByRole('button', { name: 'Ja' }).click();
  const eniga = page.getByTestId('eniga');
  await expect(eniga).toContainText('Skatteavtal med P-land');
  await expect(eniga).toContainText('riksdagen sa ja');
  await eniga.getByRole('button').click();
  await expect(page.getByTestId('resultat')).toContainText('300–0');
});

test('röst på beslutat ärende visar utfall, plenisal och partier', async ({ page }) => {
  await oppna(page);
  await page.getByRole('button', { name: 'Ja' }).click();
  const res = page.getByTestId('resultat');
  await expect(res).toContainText('RIKSDAGEN SA NEJ');
  await expect(res).toContainText('150–175');
  await expect(res.locator('circle')).toHaveCount(349);
  await expect(res).toContainText('Votering om förslagspunkt 2 – ärendet hade 2 voteringar · kl. 16:03');
  await expect(page.getByText('Du röstade ja – mot riksdagen')).toBeVisible();
  await expect(page.getByText('Så röstade partierna')).toBeVisible();
  await page.getByRole('button', { name: 'Tillbaka' }).click();
  await expect(page.getByTestId('position')).toHaveText('2 av 3');
});

test('efter alla röster visas din dag med rätt räkning', async ({ page }) => {
  await oppna(page);
  await page.getByRole('button', { name: 'Ja' }).click();          // a1: ja mot nej
  await page.getByRole('button', { name: 'Tillbaka' }).click();
  await page.getByRole('button', { name: 'Ja' }).click();          // a2: ja som ja
  await page.getByRole('button', { name: 'Tillbaka' }).click();
  await page.getByRole('button', { name: 'Nej' }).click();         // a3: kommande
  const sum = page.getByTestId('summering');
  await expect(sum).toContainText('Du röstade som riksdagen i 1 av 2');
  await expect(page.getByText('Riksdagen: beslut 16:00')).toBeVisible();
});

test('beslut utan votering (acklamation) visas som beslutat och jämförs med ja', async ({ page }) => {
  const arenden = [
    { id: 'b1', beteckning: '2026/27:TU2', utskott: 'TU', titel: 'Vägar', fraga: 'Ska vägar byggas?', reservationer: 2, status: 'beslutat', acklamation: true },
    { id: 'b2', beteckning: '2026/27:SoU6', utskott: 'SoU', titel: 'Arvsfonden', fraga: 'Redovisning.', reservationer: 0, status: 'beslutat', acklamation: true },
  ];
  await oppna(page, { ...DAG, arenden });
  await page.getByRole('button', { name: 'Nej' }).click();
  const res = page.getByTestId('resultat');
  await expect(res).toContainText('RIKSDAGEN SA JA');
  await expect(res).toContainText('Beslutat utan votering');
  await expect(page.getByText('Du röstade nej – mot riksdagen')).toBeVisible();
  await page.getByRole('button', { name: 'Tillbaka' }).click();
  await expect(page.getByTestId('summering')).toContainText('Du röstade som riksdagen i 0 av 1');
  await expect(page.getByText('Riksdagen: ja (utan votering)')).toBeVisible();
  const eniga = page.getByTestId('eniga');
  await expect(eniga).toContainText('beslutat utan votering');
  await eniga.getByRole('button').click();
  await expect(page.getByTestId('resultat')).toContainText('Beslutat utan votering');
});

test('röster sparas över omladdning', async ({ page }) => {
  await oppna(page);
  await page.getByRole('button', { name: 'Avstår' }).click();
  await page.getByRole('button', { name: 'Tillbaka' }).click();
  await page.reload();
  await expect(page.getByTestId('position')).toHaveText('2 av 3');
});

test('dag utan beslut visar tomt läge och nästa beslut', async ({ page }) => {
  await oppna(page, { ...DAG, arenden: [] });
  await expect(page.getByTestId('tom-dag')).toContainText('Inga beslut idag');
  await expect(page.getByText('torsdag 26 nov 16:00 · 3 ärenden')).toBeVisible();
});

test('temaval byter till mörkt', async ({ page }) => {
  await oppna(page);
  await page.getByRole('button', { name: 'Mer' }).click();
  await page.getByRole('button', { name: 'Mörkt' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'mörkt');
});

test('fel vid hämtning ger begripligt meddelande', async ({ page }) => {
  await page.route('**/data/idag.json', r => r.fulfill({ status: 500, body: 'fel' }));
  await page.goto('/');
  await expect(page.getByText('Kunde inte hämta dagens beslut')).toBeVisible();
});

test('skärmdumpar', async ({ page }, info) => {
  await oppna(page);
  await page.screenshot({ path: `test-results/bilder/${info.project.name}-1-kort.png` });
  await page.getByRole('button', { name: 'Ja' }).click();
  await page.screenshot({ path: `test-results/bilder/${info.project.name}-2-resultat.png`, fullPage: true });
});
