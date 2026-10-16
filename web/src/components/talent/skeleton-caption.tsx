// A visible, translated "loading" line for the text-free talent skeletons
// (TUL-946). The pulse blocks alone read as a blank white page for the 3-10 s
// a cold dashboard render takes, so QA kept reporting a blank screen.
//
// Server component, static, no locale lookup: the skeletons render before the
// dashboard's copy provider exists. The page language is already on <html
// lang>, so the Spanish line shows under html[lang^=es] and English is the
// default (if the variant ever failed to apply, English shows, never both).
// black/60 on the skeleton canvas keeps the line above 4.5:1.
export function SkeletonCaption() {
  return (
    <p role="status" data-testid="skeleton-caption" className="text-[13px] font-medium text-black/60">
      <span className="[html[lang^='es']_&]:hidden">Loading your space…</span>
      <span className="hidden [html[lang^='es']_&]:inline">Cargando tu espacio…</span>
    </p>
  );
}
