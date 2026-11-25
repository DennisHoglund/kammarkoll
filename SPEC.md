# Kammarkoll – spec

## Syfte
En PWA för iPhone som gör riksdagens arbete begripligt och lite roligt, byggd på riksdagens öppna data. Byggs i moduler (flikar). Första modulen: **Dagens beslut**.

## Stack
- Ren HTML/CSS/JS utan byggsteg. Moduler som IIFE på `window` (`KKData`, `KKSal`, `KKBeslut`).
- GitHub Pages. Ingen Supabase i steg 1 – röster sparas i `localStorage`.
- **Data hämtas inte från telefonen.** En GitHub Action (`scripts/hamta.mjs`) hämtar från `data.riksdagen.se` var 30:e minut vardagar och publicerar färdig `data/idag.json`. Löser CORS, minskar last på riksdagens API och gör offline enkelt.

## Design
- Liquid Glass (iOS 26-stil): glaskort med blur, stora feta rubriker, flytande flikrad.
- Färgprofil: blå `#0A4FC2` (ja, accent), orange `#D45A16` (nej, live). Utskott har egna färger på korten.
- Ljust och mörkt läge (`prefers-color-scheme` + val Auto/Ljust/Mörkt under Mer).
- Ikon: plenisal (stolsrader i halvcirkel) med orange talarstol. Ingen riksdagslogga – appen är inte officiell.
- Design-canvas: https://claude.ai/artifact/Paq34YznxBEHqgkzTZYwDp

## Funktioner – Dagens beslut
1. Ett kort per ärende (betänkande) som beslutas idag: utskott, titel, fråga i klartext, vad utskottet föreslår, antal motioner.
2. Användaren röstar Nej / Avstår / Ja.
   Bara ärenden **med reservationer** röstas om (omstridda först, ≥3 reservationer märks "Omstritt"). Eniga ärenden (0 reservationer) listas under "Eniga beslut" i sammanfattningen.
3. Beslutat ärende → resultatvy: utfall, plenisal med 349 platser (ja/nej/avstår/frånvarande), "du röstade som/mot riksdagen", partistaplar, vilken förslagspunkt voteringen gällde.
   Beslut utan votering (acklamation) → "Riksdagen sa ja – beslutat utan votering", utan siffror. Räknas som ja i jämförelsen.
4. Alla röstade → "Din dag i kammaren": X av Y som riksdagen, lista med bock/kryss/väntar, nästa beslutsdag.
5. Dag utan beslut → tomt läge + nästa beslutsdag.

## Funktioner – Kammaren och Kalender
- **Kammaren**: dagens program från kalendern. Kortet överst visar det som pågår (startat, nästa ej börjat, max 4 h) med "PÅGÅR NU" och länk till webb-tv, annars nästa händelse. Uppdateras varje minut. Tom dag → nästa sammanträde.
- Varje programrad fälls ut med en kort förklaring av sammanträdestypen (bordläggning, beslut, debatt, frågestund …) och dess ärenden.
- **Dagordning**: kammarens föredragningslista för dagen (kalenderhändelsens `XRDDOKID` → `dokumentstatus` → referens `f-lista` → `dokument/<id>.html`), uppdelad i sektioner med numrerade punkter, beteckning och reservationer. Hämtas för dagar inom en vecka.
- **Kalender**: dagväljare för de kommande 14 dagarna med kammarhändelser, orange prick = beslutsdag, dagens program och ärenden.

## Dataformat `data/idag.json`
```json
{ "genererad": "ISO", "datum": "ÅÅÅÅ-MM-DD", "exempel": false, "beslutstid": "16:00" | null,
  "arenden": [{ "id", "beteckning", "utskott": "TU", "titel", "fraga", "utskottSager"?, "motioner"?,
    "status": "kommande" | "beslutat", "url", "acklamation"?: true,
    "resultat"?: { "utfall": "ja"|"nej", "tid"?: "16:04", "punkt"?: 2, "voteringar": 2, "ja", "nej", "avstar", "franvarande", "partier": [{ "parti", "ja", "nej", "avstar", "franvarande" }] } }],
  "nasta": { "datum", "tid"?, "antal" } | null,
  "program": [{ "datum", "tid" | null, "titel", "typ": "votering"|"arbetsplenum"|…, "arenden": [{ "beteckning", "titel" }], "dokid"? }],
  "dagordning": { "ÅÅÅÅ-MM-DD": { "id", "titel", "sektioner": [{ "rubrik", "punkter": [{ "nr", "text", "beteckning"?, "info"?, "grupp"? }] }] } } }
```
Den incheckade filen är **exempeldata** (`"exempel": true`). Actions skriver över den vid deploy.

## Källor i API:et (att verifiera)
- Betänkanden: `dokumentlista/?doktyp=bet&rm=2026%2F27&utformat=json` – **verifierat i CI 2026-11-22**: fälten `dok_id, rm, beteckning, organ, titel, notis, summary, beslutsdag, debattdag, beslutad, klockslag, reservationer, dokument_url_html` finns. `beslutsdag` är `"0"` när den inte är satt. 109 betänkanden 2026/27, nästa beslutsdag 2026-11-25 (17 st). `beslutad` är `"0"` före och `"1"` efter beslut (verifierat 2026-11-25) – även när beslutet fattades utan votering.
- Voteringar: `voteringlista/?rm=…&bet=…&utformat=json` – **verifierat**: `votering_id, punkt, parti, rost (Ja/Nej/Avstår/Frånvarande), avser (sakfrågan/motivfrågan), votering (huvud), systemdatum`. Första huvudvoteringen i sakfrågan räknas; `systemdatum` ger voteringstiden. **Verifierat 2026-11-25**: 4 av 17 betänkanden voterades (CU2, KrU3, SoU3, JuU9), vardera förslagspunkt 2 och 3, 349 röster per votering, `punkttyp` "Forslagspunkt". Övriga 13 ger tomt svar (`@antal` 0) → beslutade med acklamation (`beslutad` = "1", ingen votering).
- Kalender: `kalender/?org=kamm&utformat=json&sz=500` – **verifierat**: datumparametrar ignoreras, svaret innehåller alla kommande kammarhändelser. Filtreras på `DTSTART` (ÅÅÅÅMMDDTHHMMSS). Votering = `CATEGORIES` innehåller "votering" (SUMMARY "Beslut"). Ingen CORS-header – därför hämtning i Actions.
- Fråga i klartext = första stycket i `notis` (HTML), kortat till ~260 tecken. Utskottets förslag läses ur "föreslår att riksdagen säger ja/nej".
- `scripts/sond.mjs` + workflow "Sond" (manuell) skriver ut råsvar och provkör pipelinen för valfri dag.
- Om fälten heter annat: justera `parseBetankanden`/`parseVotering` och fixturerna i `tests/hamta.test.mjs`.

## Tester
- `npm run test:data` – enhetstester för datapipelinen (node:test).
- `npx playwright test` – iPhone 14 (WebKit) och Pixel 7 (Chromium), sv-SE, Europe/Stockholm, `serviceWorkers: 'block'`, `data/idag.json` mockas.
- CI: rapport publiceras på `/rapport/`, röd körning om Playwright föll.

## Beslut
- Värmemätaren och "Vem grälar med vem" pausade: anförande-API:et saknar klocktid, och partiledardebatternas repliker styrs av regler (M–S alltid 8 skiften/riksmöte). Repliker kan dock paras exakt via `anforande_nummer` (3 586/3 586 i test).
- Dagens beslut valdes framför "Dagens motion" – motioner kommer i klump under allmänna motionstiden, beslut kommer löpande.

## Kvar att göra
- Flera voteringar per betänkande: idag visas bara första förslagspunkten (punkt + antal voteringar anges). Kräver punktens rubrik (finns inte i voteringlista).
- Fråga i klartext och antal motioner (AI-sammanfattning i Action).
- Egen rapportsida i appens färgprofil (som Svampkartan), historik/trend.
- Cron-körningar publicerar utan `/rapport/` – behåll senaste rapport.
- "X % av Kammarkolls användare" kräver backend (Supabase, delat projekt, prefix `kammarkoll_`).
- Riktig pågår-status (t.ex. från webb-tv) i stället för uppskattning från kalendertider.
