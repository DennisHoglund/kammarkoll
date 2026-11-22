# Kammarkoll

PWA på riksdagens öppna data. Första modulen: **Dagens beslut** – rösta på dagens ärenden och se om du röstade som riksdagen.

## Kom igång
```bash
npm ci
npm start            # http://localhost:4173 (visar exempeldata)
npm run hamta        # hämtar riktig data till data/idag.json
npm test             # pipeline + Playwright
```

## Filer
| Fil | Innehåll |
|---|---|
| `index.html`, `styles.css` | Skal, flikrad, Liquid Glass, ljust/mörkt |
| `app.js` | Flikar, tema, laddning, service worker |
| `data.js` | Hämtar `data/idag.json`, offline-cache, röster i localStorage |
| `beslut.js` | Modulen Dagens beslut |
| `kammarsal.js` | Plenisalen med 349 platser som SVG |
| `sw.js` | Service worker (nätet först) |
| `scripts/hamta.mjs` | Hämtar från riksdagen, körs i GitHub Actions |
| `tests/` | Playwright + enhetstester |

## Publicering
GitHub Actions bygger, testar, hämtar dagens data och publicerar på Pages vid push och var 30:e minut vardagar. Pages → Source ska vara **GitHub Actions**.

Källa: Sveriges riksdag, riksdagens öppna data.
