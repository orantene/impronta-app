# Nail Studio header — title first, logo replaces EN

**Branch:** `cursor/nail-studio-header-logo-b3db`  
**Before (Oran screenshot):** `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/media/nail-studio-header/before-en-button.png`

## Change

Header reading order:

1. **Nail Studio** + subtitle  
2. **Tulala logo** (moved from left; replaces EN pill)  
3. Deshacer / Undo  
4. Reiniciar / Reset  

In-app EN/ES toggle removed — language stays on site settings / page chrome + host `postMessage` `{type:'lang'}` / `?lang=`.

## Files

- `web/design-references/apps/nail-designer-v2/src/app.js` + `style.css` → `build.py` → `nail-designer.html` → `apps:sync-nail-studio` → `public/apps/nail-studio/index.html`
- Static assert in `nail-designer.test.tsx`

## Verify

- Desktop/phone Nail Studio: no EN pill; title left; logo then undo/reset right.
- Switching site language still updates the iframe (host lang postMessage).
