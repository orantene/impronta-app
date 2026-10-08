# Tulala.digital Nail Studio — handoff for Claude Code

A self-contained nail designer (Spanish/English) to embed in tulala.digital.
The shipped app is **one file**: `nail-designer.html` (inline CSS + JS, no build step, no dependencies except Google Fonts).

## Files
- `nail-designer.html` — the finished app (what goes on the site).
- `src/app.js` — the app's JavaScript (same code that is inlined in the HTML).
- `src/style.css` — the app's CSS (same code that is inlined in the HTML).
- `src/build.py` — rebuilds `nail-designer.html` by inlining `src/style.css` and `src/app.js` into it.
- `tulala-logo.svg` — Tulala wordmark rebuilt as a vector (Quicksand 500 letterforms + 3 orange dots). Replace with the official SVG if available; the same path/dots live in `LOGO_D` / `LOGO_DOTS` in `app.js`.

Workflow: edit `src/app.js` / `src/style.css`, run `python3 src/build.py`, open `nail-designer.html` in a browser.
(`build.py` expects the HTML at `../nail-designer.html` relative to `src/` — adjust the paths at its top if you move things.)

## Architecture (`app.js`, one IIFE mounted on `#nail-designer`)
1. **Catalog** — `COLORS`, `PATTERNS` (45 art designs), `FINISHES` (7), `SHAPES` (6), `FREE` (length presets short…xxxl), `SKINS`, `FINGERS` (hand geometry in a 1000×800 drawing), `TRENDS` (ready-made looks).
2. **Language** — `I18N.en` / `I18N.es`. No in-app EN/ES toggle (site chrome owns that). Picks `?lang=`, then `data-lang`, host `postMessage` `{type:'lang'}`, then saved choice, then browser language. Header reads: Nail Studio title → Tulala logo → Undo → Reset.
3. **Helpers**.
4. **Drawing (all SVG)** — `geom()` nail size, `nailPath()` shape outline, `artLayer()` patterns, `finishLayer()` finishes (lit by the lamp: `g.lx` direction, `g.lk` strength, `g.lc` colour), charms module (`CH` catalog, `gemSVG`, `pearlSVG`, `metalSVG`, `charmsSVG`), `nailSVG()`, `fingerPath()`, `fingerSVG()`, `handSVG()`.
5. **State** — single object `S` (nails[5], shape, length (number), skin, target 'all'|'one', sel, tab, history, looks, lamp: lampF/lightLvl/lightCol, selCharm). `clean()` validates any incoming design. `encodeDesign()`/`decodeDesign()` for share links (`#d=`).
6. **Host messaging** — `emit()` posts `{source:'nail-designer', type:'change'|'save'|'share'|'download', design}` to the parent; listens for `{target:'nail-designer', type:'load'|'lang'|'get'}`.
7. **UI** — `shell()` builds DOM once; `render()` → `renderHand()` + `renderPanel()` + floating controls (length slider, skin, tip, lamp, charm toolbar). View/zoom: `VIEW`, `handBox()`, `fitBox()`, `targetVB()`, `focusNail()`, `zoomTo()`.
8. **Export** — `makePNG()` (1600×1440 PNG with Tulala footer), share sheet, WhatsApp, Web Share.
9. **Events** — one delegated click handler on `data-act`, plus pointer handlers (charm drag, lamp drag, length slider, pan).
10. **Start** — loads a design from `#d=` if present; exposes `window.NailDesigner`.

## Design JSON (what to store in your backend)
```json
{ "version": 2, "shape": "almond", "length": 0.38, "skin": "#E9BE9E",
  "nails": [ { "c1": "#E8A9A6", "c2": "#F7F3EE", "pattern": "french", "finish": "gloss",
               "charms": [ { "id": "gem", "x": 0, "y": 0.6, "s": 1, "r": 0 } ],
               "tip": 0.2, "shape": "coffin" } ] }
```
`tip` and per-nail `shape` are optional. Always pass incoming data through `clean()`.

## Embedding
```html
<iframe src="nail-designer.html?lang=es" style="width:100%;height:780px;border:0" allow="clipboard-write; web-share"></iframe>
```
- Set `data-parent-origin="https://tulala.digital"` on `#nail-designer` to lock postMessage to your domain.
- `data-promo="off"` hides the Tulala promo cards (use on tulala.digital itself).
- Promo/logo links carry `utm_source=nail-studio&utm_medium=app&utm_content=<spot>`.
- If the iframe is sandboxed, include `allow-downloads allow-popups allow-scripts allow-same-origin`.

## Conventions / gotchas
- Never name a CSS state class `nd-one` — `.nd-one` is the "Solo …" button and `render()` sets its textContent (this once blanked the whole stage).
- Colours: UI accent `--accent:#A63D57` (rose) — the owner prefers rose over Tulala orange for the UI. The Tulala logo keeps its own black + orange dots.
- Charm size is limited to 50–150% (`c.s` 0.5–1.5).
- Saved looks live in `localStorage` (`nail-studio-looks-v2`); every access is wrapped in try/catch.
- Test in a real browser after changes (Playwright works well: click tabs, `NailDesigner.getDesign()`, compare share-link round trips).

## Ideas not built yet
- Per-nail length; official Tulala SVG logo; saving looks to a Tulala account instead of localStorage; photo-real hand option (nails drawn over a hand photo).
