# Design gallery, design library & Mi presencia: audit + 2026 redesign

Date: 2026-10-02 · Surfaces: Mi presencia (Mi sitio web), "Elige un diseño" (design library), per-design gallery ("Cambiar diseño": demos, preview, Apps tab, colours, import), builder Apps tab, Nail Designer app.
Audit: 4 designs, 25 demos, 1440 + 390, ES. 47 findings: 9 P0 · 23 P1 · 15 P2. Read-only (nothing applied/saved).
Evidence folder (on the owner's Mac): `/private/tmp/claude-505/-Users-oranpersonal-Desktop-impronta-app/f0374548-4bfd-47f5-a318-dfb8b4e8fd7a/scratchpad/gallery-audit/` (findings.json, demo-verdicts.json, montages in `mont/`).

---

## Part 1 — What is broken today

### P0 (fix before anyone sees it)
1. **Services menu squeezed into a narrow column, right side empty** — Maison v2 Lashista, Barbero, Cejas; Gridline Alex. Lashista + Barbero also overflow right (section edge 1544px in a 1280px frame).
2. **Nail Designer app renders as a ~280px phone column inside a wide desktop section**, English heading ("Design your nails before your visit") in a Spanish page (Alba, Linh).
3. **Apps tab**: app cramped in a wide frame, its header (logo, EN, Deshacer, Reiniciar) overlaps the title; the Escritorio/Teléfono switch is ignored there.
4. **Apps flow is a dead end**: only the 1 suggested app ("Apps · 1"); no browse-all, no "templates that suit this app", no add/enable, no path back to a template with the app; Folio and Gridline have no Apps tab at all.
5. **Maison (v1) "Demo" mode shows the talent's own profile** (Valeria) with just a "CONTENIDO DEMO" tag and an English hero bio.
6. *(+4 more P0 in findings.json: overflow/overlap variants of the above.)*

### P1
- **Mode default is confusing**: gallery opens on "Mi contenido", so clicking a demo card does nothing visible; on phone it silently flips to Demo.
- **Language mixing**: Maison v2 Linh/Cejas/Estilista/Barbero have English body copy in a Spanish page; Gridline Gary/Tamika/Omar/Grace mix "Recent jobs"/"Specifications" with Spanish.
- **Demo cards show a gradient + trade, not the person** (Camila Rivas, Renata Salgado…). Duplicates: "Uñas y pestañas" ×2 (Maison v2), "Modelo de moda" ×2 (Folio). "N demos" counts disabled demos (Maison says 6, only 1 usable).
- **Right-panel tags are English** ("Warm", "Service menu", "Booking-ready") while the library cards are Spanish; they look like filters but do nothing.
- **"★ App" badge floats detached below the cards** and doesn't say which app.
- **No demo information**: never shows person, city, languages (EN/ES), booking mode (instant/request/quote), currency, sections or apps. Also all 21 demo talents have identical site settings (bookings/inquiries/chat on, chat_config empty), so previews can't show the differences between demos.
- **Folio content**: every demo has the same caption ("Editorial, runway y campañas"); empty FAQ and empty "MEDIDAS · COMP CARD" bar on several; Andre's name clipped; "senior" card vs "maduro" content; model-singer shows generic model copy.
- **Invisible text**: footer headline dark-on-dark (Maison v2 Camila, Linh, Estilista); Maison v1 header logo + FAQ questions nearly invisible.
- **Floating "Ver servicios" dock covers content** while scrolling; a cookie notice node is injected into the preview.
- **"Colores propios" / "Colores personalizados" sheet is dated**: full-height drawer with a text "Cerrar" link, raw hex inputs, every colour shown twice (circle + square), invisible palette-name field, contrast warning cut off by the sticky bar on phone, off-brand green "Guardar colores".
- **Import content from a demo**: only exists on Maison v1 ("Importar contenido inicial de este demo"), opens "Agregar contenido inicial" with 3 empty groups; Maison v2, Folio and Gridline have no import at all.
- **Three exits with three labels** ("‹ Hoy", "Volver a Mi sitio", ✕). "Elecciones guardadas" implies autosave while "Usar este diseño" is the real commit.
- **Builder Apps tab**: one app, locked behind Web Office, search placeholder says "Buscar secciones y bloques".
- **Phone preview**: Lashista portfolio overflows (510px in a 344px frame); floating bar covers the hero.
- **Visual weight**: six solid black blocks on one screen (Teléfono, Apps tab, Demo, selected colour, Usar este diseño, the app's own toggle) — nothing stands out, the screen feels heavy and old.

### Mi presencia → "Mi sitio web"
- Tiny, mostly empty site thumbnail; four equal buttons in a row with one solid black; "Restaurar diseño anterior" as an easy-to-miss underline; Q&A card shows a disabled "Guardar" before anything is typed; the page reads as a stack of boxes rather than one home for the site.

### "Elige un diseño" (library)
- Cards are dense (tags, "Demo destacada", "Ideal para la app", "N demos", "Explorar tema"); Maison thumbnail mostly empty; Gridline card cut off; three rows of filters; floating "★ App" pill.

### What already works
Library search + empty state; category chips filter (but Maison v1 wrongly appears under Modelos/Música); palette swatches switch the preview; apps at 390 render a proper phone layout; Maquillista, carpenter, appliance and handyperson demos are clean.

### Every demo, one line
- **Maison**: nails — shows the talent's own profile, English hero, faint FAQ/logo.
- **Maison v2**: Alba — narrow English app embed · Camila — footer invisible, menu right column empty · Renata — menu squeezed, carousel overflows · Linh — English content + English app, invisible footer · Cejas — squeezed, English · Maquillista — clean · Estilista — English, invisible footer · Barbero — squeezed, strip overflows, English.
- **Folio**: Mateo + Lucía — placeholders, empty FAQ + comp-card bar · commercial — placeholders, English talent in Spanish chrome · fitness — clipped name, empty bars · runway — placeholders, overflow · hand — placeholders, English · mature — label/content mismatch · model-singer — generic model copy.
- **Gridline**: Alex — services squeezed · electrician, plumber, computer, smart-home — EN/ES mixed (computer: tiny mono text on dark) · carpenter, appliance, handyperson — clean.

---

## Part 2 — The 2026 redesign

### Design language (binding)
- **Speak with images, icons and flow. Minimal words.** Any explanation lives behind an **ⓘ** tooltip, never as paragraphs.
- **One solid primary action per screen** ("Usar este diseño", "Publicar"). Everything else is quiet: light segmented controls, selection shown with a thin ring + tick, no stacked black blocks.
- **The template is the hero.** Big live previews, chrome recedes around them.
- **Modern patterns**: icon close (✕), sheets that slide with a live preview beside them, visual colour pickers (no raw hex unless "Avanzado"), skeletons instead of empty states, smooth transitions between demos.
- **One consistent system** from Mi presencia → library → design → demo → apps → colours → publish.
- **No dead ends.** Every screen has a next step and a way back. One exit pattern everywhere (← back, ✕ close).
- EN + ES, tú, no em dashes, tokens only.

### 1. Mi presencia → "Mi sitio web"
- **Hero card**: a large live, scrollable preview of the talent's site (phone + desktop toggle as two small icons), status dot "En vivo", domain as a chip with copy/open icons.
- **One primary action**: "Editar sitio". Secondary as icon buttons with ⓘ labels: Cambiar diseño (palette icon), Colores (droplet), Ver sitio (external), Historial (clock, replaces "Restaurar diseño anterior" and shows versions).
- Domain, Q&A and Ajustes become a tidy row of **tiles with icons** (Dominio · Preguntas · Ajustes · Apps), each opening its own sheet. Q&A "Guardar" only appears once something changes.

### 2. "Elige un diseño" (library)
- **Full-height preview cards** you can hover-scroll (desktop) / swipe (phone); below each: name + one line of chips with icons: `Belleza · ES/EN · 8 demos · 🧩 Diseñador de uñas`. No paragraph, no tag soup; description behind ⓘ.
- **One filter row**: trade chips (with icons) + a single "Filtros" button (style, languages, booking mode, has apps) in a sheet.
- "Sugerido para ti" as a subtle ribbon on the card, not a text line.
- Only count **usable** demos.

### 3. Design gallery ("Cambiar diseño")
- **Layout**: preview takes ~70% of the width, a slim right rail for controls. Header: ← back · design name · device toggle (2 icons) · ✕. Remove "Elecciones guardadas"; show a quiet "Sin publicar" dot only when there are unsaved choices.
- **Demo strip = people, not gradients**: round photo + name + trade + flag/language chips (e.g. **Camila Rivas · Manicurista · 🇲🇽 ES·EN**). The app indicator is a small 🧩 corner badge *on the card* with the app name in its ⓘ tooltip.
- **Default to Demo mode** when the user is browsing; "Ver con mi contenido" is a toggle in the rail with a one-line ⓘ. Clicking a demo always visibly changes the preview.
- **Demo profile panel (rail)**: icon list — 📍 city · 🗣 languages · 📅 booking mode · 💱 currency · 🧩 apps · 🧱 sections. ⓘ "Qué cambia / qué se queda": *changes*: layout, colours, sections, apps · *stays yours*: services, prices, booking settings, languages, domain.
- **Colours**: swatch row with a thin selection ring; "Personalizar" opens a **side sheet with live preview**: 4 visual pickers (fondo, texto, acento, sección) with a contrast badge that auto-suggests a fix; hex only under "Avanzado"; primary button in brand colour, not green; ✕ close icon.
- **Import from demo** (all designs, not just Maison v1): a clear "Usar contenido del demo" step with checkboxes per group (servicios, fotos, preguntas, textos), each showing a count and a thumbnail; never empty groups.
- **Apps tab → Apps panel** (see 4).
- **Preview hygiene**: no cookie banner in previews; floating dock never covers content (reserve space or show a mini-dock); no "CONTENIDO DEMO" tag over content (use a corner chip on the frame).

### 4. Apps — a full flow with no dead ends
- **Entry points**: 🧩 badge on demo cards; "Apps" in the design rail; builder Apps tab; Mi presencia "Apps" tile; app search.
- **Apps library**: "Sugeridas para tu oficio" first, then "Todas las apps" grid (icon, name, one line, trades it suits, which designs it looks best in).
- **App page**: live try-it (desktop layout on desktop, phone on phone), "Se ve mejor en" → design thumbnails (click → that design's gallery with the app placed), "Agregar a mi sitio" (or "Disponible en Oficina Web" with an ⓘ and upgrade path, never a dead lock).
- **Back paths**: from an app to templates, from a template to its apps, from the builder to the library.

### 5. Nail Designer (and every app) inside a template
- On desktop it renders as a **real section**: two-column layout (hand/nail canvas left, controls right) using the template's fonts, colours, radius and spacing tokens; on phone the stacked app.
- Header controls (logo, EN, Deshacer, Reiniciar) live inside the app chrome, never overlapping the section title; language follows the site/visitor (ES on Spanish sites); title + subtitle localised.
- Section spacing matches neighbouring sections; no "phone in an empty box".

### 6. Demo content quality (data fixes)
- Every demo: real person name, consistent trade label, city, one language set that matches its copy (ES demos fully Spanish, EN demos fully English, bilingual demos switchable).
- Give demos **different site settings** (some request-only, some quote, one chat-off, different languages) so previews show the range.
- Folio: per-demo captions, filled FAQ and comp-card measures (or hide empty blocks), fix clipped names, align labels (senior/maduro), singer-specific copy.
- Fix invisible footers/logos (token contrast), squeezed menus and overflows.

---

## Part 3 — Execution plan (owner of code: Template factory chat; coordinate merges through integ/fresh-qa)

**Wave 1 — P0 fixes (no redesign needed)**: menu layout squeeze + overflows; Nail Designer desktop section + ES copy + header overlap; Maison v1 demo mode showing own profile; invisible footer/logo text; preview hygiene (cookie banner, dock overlap, demo tag).
**Wave 2 — content & info**: demo person names on cards; usable-demo counts; ES/EN consistency per demo; demo profile panel; Spanish tags (as real filters or removed); varied demo site settings; Folio content fixes.
**Wave 3 — redesign**: library cards + one filter row; gallery layout (preview-first, quiet chrome, one primary action, one exit pattern); colours sheet; import for all designs; Mi presencia hero + tiles.
**Wave 4 — Apps flow**: apps library, app pages, "se ve mejor en", add/upgrade path, back links; Apps tab on Folio + Gridline.
**Acceptance**: every demo scrolled top-to-bottom at 1440 / 390 / 360 with screenshots, no overflow/overlap/invisible text, no EN in ES, every flow reachable both ways, gallery at most one solid black element per screen.
