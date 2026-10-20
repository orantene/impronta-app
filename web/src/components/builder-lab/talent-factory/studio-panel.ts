/**
 * Theme Studio panel, rendered to an HTML string ON THE SERVER so neither the
 * EN/ES copy nor the markup ships in the admin client bundle (the Factory tab
 * only injects the string and toggles `[data-l]` by language). Everything
 * interpolated is escaped.
 */
import { STUDIO_COPY } from "./studio-checklist-copy";
import type { StudioChecklist, StudioTokenPreview } from "./studio-checklist";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** One string in both languages; the tab shows the active one. */
const both = (en: string, es: string) => `<span data-l="en">${esc(en)}</span><span data-l="es">${esc(es)}</span>`;

export function renderStudioPanel(checklist: StudioChecklist, tokens: StudioTokenPreview | undefined): string {
  const { en, es } = STUDIO_COPY;
  const head = both(
    `${en.title}: ${checklist.ready ? en.ready : en.notReady}`,
    `${es.title}: ${checklist.ready ? es.ready : es.notReady}`,
  );
  const rows = checklist.rows
    .map((r) => {
      const hint = r.detail ? ` (${r.detail})` : r.key === "parity" && !r.ok ? null : "";
      const line = (c: typeof en | typeof es) =>
        `${r.ok ? c.ok : c.blocked}: ${c.rows[r.key]}${hint === null ? ` (${c.noRun})` : hint}`;
      return `<li data-studio-row="${r.key}" data-ok="${r.ok ? 1 : 0}">${both(line(en), line(es))}</li>`;
    })
    .join("");
  const checklistHtml =
    `<div data-studio-checklist="${checklist.ready ? "ready" : "blocked"}">` +
    `<p class="text-xs uppercase tracking-wider text-white/40">${head}</p>` +
    `<ul class="mt-1 space-y-0.5">${rows}</ul></div>`;
  if (!tokens) return checklistHtml;
  const palettes = tokens.palettes
    .map(
      (p) =>
        `<div class="mt-1 flex items-center gap-1" data-studio-palette="${esc(p.key)}">` +
        p.swatches
          .map(
            (s) =>
              `<span title="${esc(s.role)} ${esc(s.hex)}" class="inline-block h-4 w-4 rounded border border-white/20" style="background:${esc(s.hex)}"></span>`,
          )
          .join("") +
        `<span class="ml-1 text-xs text-white/60">${esc(p.name)}</span></div>`,
    )
    .join("");
  const sample = tokens.heading
    ? `<p class="mt-1 text-lg" style="font-family:${esc(tokens.heading)}" data-studio-type-sample>Aa ${esc(tokens.heading.split(",")[0] ?? "")}</p>`
    : "";
  return (
    checklistHtml +
    `<div class="mt-3" data-studio-tokens><p class="text-xs uppercase tracking-wider text-white/40">${both(en.tokens, es.tokens)}</p>` +
    `${sample}${palettes}<p class="mt-1 text-xs text-white/50">${both(en.editHint, es.editHint)}</p></div>`
  );
}
