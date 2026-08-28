"use client";

/**
 * layout-flatten-toast — DEPTH-CAP HONESTY, the operator-facing half.
 *
 * The draft-save normalizer flattens wrapper chains deeper than the shared
 * nesting cap. Content survives (that is the normalizer's load-bearing
 * invariant), but the LAYOUT changes, and it used to change silently — which
 * from the operator's seat is data corruption, not a guardrail. This names the
 * blocks it restructured, on the surface where the operator can go look at them.
 *
 * `attention`, not `error`: nothing failed and nothing was lost, but the
 * operator has to know. And it never auto-dismisses (the state in
 * `use-layout-flatten-warning` has no ttl) — a structural change to their own
 * work is acknowledged, not blinked past.
 */

import { EditToast } from "./kit/edit-toast";
import { useEditContext } from "./edit-context";
import { useEditorLocale } from "./use-editor-locale";

export function LayoutFlattenToast() {
  const { t, locale } = useEditorLocale();
  const { layoutFlattenToast, clearLayoutFlattenToast } = useEditContext();
  if (!layoutFlattenToast) return null;
  const { labels, count } = layoutFlattenToast;
  const extra = count - labels.length;
  const named = labels.join(", ");
  const headline =
    locale === "es"
      ? count === 1
        ? "Se simplificó 1 bloque anidado"
        : `Se simplificaron ${count} bloques anidados`
      : count === 1
        ? "1 nested block was simplified"
        : `${count} nested blocks were simplified`;
  const body =
    locale === "es"
      ? `Tu diseño superaba el límite de anidación, así que al guardar se subió el contenido de estos contenedores un nivel: ${named}${extra > 0 ? ` y ${extra} más` : ""}. No se perdió ningún contenido. Si necesitas esa estructura, quita un contenedor intermedio y vuelve a guardar.`
      : `Your layout went past the nesting limit, so this save moved the contents of these wrappers up one level: ${named}${extra > 0 ? ` and ${extra} more` : ""}. No content was lost. If you need that structure, remove one wrapper in between and save again.`;
  return (
    <EditToast
      overlayId="layout-flatten-toast"
      role="alert"
      tone="attention"
      onDismiss={clearLayoutFlattenToast}
      className="max-w-[min(92vw,560px)]"
    >
      <span className="block text-[10px] uppercase tracking-[0.06em] opacity-80">
        {t("Layout changed on save")}
      </span>
      <span className="block font-semibold">{headline}</span>
      <span className="mt-1 block text-[11px] font-normal leading-snug">
        {body}
      </span>
    </EditToast>
  );
}
