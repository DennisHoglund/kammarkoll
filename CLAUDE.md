# Regler för Kammarkoll

- Svara och skriv kod-kommentarer, commits och UI-text på svenska.
- Ingen byggsteg: ren HTML/CSS/JS, moduler som IIFE på `window`.
- Appen hämtar aldrig direkt från data.riksdagen.se – bara `data/idag.json`. Ändringar i datahämtning görs i `scripts/hamta.mjs` + `tests/hamta.test.mjs`.
- Höj `VERSION` i `sw.js` vid varje ändring av appfiler, och lägg nya filer i `FILER`.
- Kör `npm test` innan commit. Rött i WebKit men grönt i Chromium = oftast riktigt Safari-fel – fixa appen.
- Ingen riksdagslogga eller officiell profil – appen är inte riksdagens.
- Tillskriv aldrig ett parti eller en ledamot åsikter i exempel- eller testdata. Använd platshållare (P1, [Ledamot]).
- Supabase (när det behövs): delat projekt, rör aldrig befintliga tabeller, prefix `kammarkoll_`.
- Uppdatera `SPEC.md` när funktioner, dataformat eller beslut ändras.
