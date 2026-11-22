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
3. Beslutat ärende → resultatvy: utfall, plenisal med 349 platser (ja/nej/avstår/frånvarande), "du röstade som/mot riksdagen", partistaplar.
4. Alla röstade → "Din dag i kammaren": X av Y som riksdagen, lista med bock/kryss/väntar, nästa beslutsdag.
5. Dag utan beslut → tomt läge + nästa beslutsdag.

## Dataformat `data/idag.json`
```json
{ "genererad": "ISO", "datum": "ÅÅÅÅ-MM-DD", "exempel": false, "beslutstid": "16:00" | null,
  "arenden": [{ "id", "beteckning", "utskott": "TU", "titel", "fraga", "utskottSager"?, "motioner"?,
    "status": "kommande" | "beslutat", "url",
    "resultat"?: { "utfall": "ja"|"nej", "ja", "nej", "avstar", "franvarande", "partier": [{ "parti", "ja", "nej", "avstar", "franvarande" }] } }],
  "nasta": { "datum", "tid"?, "antal" } | null }
```
Den incheckade filen är **exempeldata** (`"exempel": true`). Actions skriver över den vid deploy.

## Källor i API:et (att verifiera)
- Betänkanden: `dokumentlista/?doktyp=bet&rm=2026%2F27&utformat=json` – antar fälten `dok_id, rm, beteckning, organ, titel, notis, beslutsdag, dokument_url_html`.
- Voteringar: `voteringlista/?rm=…&bet=…&utformat=json` – fälten `votering_id, punkt, parti, rost, avser` (dokumenterade för dataset). Första punkten i sakfrågan räknas.
- Om fälten heter annat: justera `parseBetankanden`/`parseVotering` och fixturerna i `tests/hamta.test.mjs`.

## Tester
- `npm run test:data` – enhetstester för datapipelinen (node:test).
- `npx playwright test` – iPhone 14 (WebKit) och Pixel 7 (Chromium), sv-SE, Europe/Stockholm, `serviceWorkers: 'block'`, `data/idag.json` mockas.
- CI: rapport publiceras på `/rapport/`, röd körning om Playwright föll.

## Beslut
- Värmemätaren och "Vem grälar med vem" pausade: anförande-API:et saknar klocktid, och partiledardebatternas repliker styrs av regler (M–S alltid 8 skiften/riksmöte). Repliker kan dock paras exakt via `anforande_nummer` (3 586/3 586 i test).
- Dagens beslut valdes framför "Dagens motion" – motioner kommer i klump under allmänna motionstiden, beslut kommer löpande.

## Kvar att göra
- Verifiera API-fält mot riktiga svar och sätt `beslutstid` från kalendern.
- Fråga i klartext och antal motioner (AI-sammanfattning i Action).
- Egen rapportsida i appens färgprofil (som Svampkartan), historik/trend.
- Cron-körningar publicerar utan `/rapport/` – behåll senaste rapport.
- "X % av Kammarkolls användare" kräver backend (Supabase, delat projekt, prefix `kammarkoll_`).
- Flikarna Kammaren och Kalender.
