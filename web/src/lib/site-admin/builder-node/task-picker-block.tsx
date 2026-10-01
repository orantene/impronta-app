/**
 * Task picker block (Gridline W-11 `.gl-tasks`, `.gl-task`, `.gl-rec`).
 *
 * Grid: 2 columns by default, 3 when the block's own container is >= 700px,
 * 1 at 370px and under (the mockup's three tiers, as container queries so the
 * builder canvas and the live page agree). The recommendation card is a
 * bordered panel with a filled header strip. Token colours only. Hover lift is
 * motion, so it only applies when the visitor has not asked for reduced motion.
 * Hidden when no task has a usable target service: nothing is invented.
 */
import type { CSSProperties, ReactNode } from "react";

import { anchorIdAttrs } from "./anchor-id";
import { TaskPickerIsland } from "./task-picker-island";
import { buildTaskPickerModel } from "./task-picker-recommend";
import type { BuilderTaskPickerNode } from "./types";
import type { TalentOffering } from "@/lib/talent/offerings-types";

export const TASK_PICKER_CSS = `
.sb-tp{container:sbtp/inline-size;color:var(--token-color-ink);font:inherit;width:100%;min-width:0;box-sizing:border-box}
.sb-tp[data-tp-empty="1"]{display:none!important}
.sb-tp-header{margin-bottom:.75rem}
.sb-tp-eyebrow{margin:0 0 .35rem;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--token-color-muted)}
.sb-tp-title{margin:0;font-size:clamp(1.35rem,2.5vw,1.85rem);font-weight:600;letter-spacing:-.02em;line-height:1.15}
.sb-tp-tasks{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.sb-tp-task{display:grid;grid-template-columns:28px 1fr;gap:8px;align-items:center;text-align:left;min-height:60px;padding:10px;border-radius:var(--site-radius-md,8px);border:1.5px solid var(--token-color-line);background:var(--token-color-surface-raised,var(--token-color-background));color:var(--token-color-ink);font-family:inherit;font-weight:700;font-size:13.5px;line-height:1.2;cursor:pointer;transition:border-color .15s}
.sb-tp-ic{width:22px;height:22px;color:var(--token-color-muted)}
.sb-tp-task:hover,.sb-tp-task:focus-visible{border-color:var(--token-color-ink)}
.sb-tp-task[aria-pressed="true"]{border-color:var(--token-color-ink);background:var(--token-color-ink);color:var(--token-color-background)}
.sb-tp-task[aria-pressed="true"] .sb-tp-ic{color:var(--token-color-accent,var(--token-color-background))}
@media (prefers-reduced-motion:no-preference){.sb-tp-task{transition:border-color .15s,transform .15s}.sb-tp-task:hover{transform:translateY(-1px)}}
.sb-tp-rec{margin-top:8px;border:1.5px solid var(--token-color-ink);border-radius:var(--site-radius-md,8px);background:var(--token-color-surface-raised,var(--token-color-background));overflow:hidden}
.sb-tp-rec-h{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 12px;background:var(--token-color-accent,var(--token-color-ink));color:var(--token-color-accent-on,var(--token-color-ink));font:700 11px var(--site-mono-font,ui-monospace,monospace);letter-spacing:.06em;text-transform:uppercase}
.sb-tp-rec0 .sb-tp-rec-h{background:var(--token-color-ink);color:var(--token-color-background)}
.sb-tp-rec-b{padding:12px;display:grid;gap:10px}
.sb-tp-rec h3{margin:0;font-size:22px;font-weight:800;line-height:1.05}
.sb-tp-rec p{margin:0;font-size:14px;color:var(--token-color-muted)}
.sb-tp-rec dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font:500 12.5px var(--site-mono-font,ui-monospace,monospace)}
.sb-tp-rec dt{color:var(--token-color-muted)}
.sb-tp-rec dd{margin:0;text-align:right;font-weight:700}
.sb-tp-row{display:flex;gap:8px}
.sb-tp-btn{flex:1;min-height:44px;padding:0 14px;border-radius:var(--site-radius-md,8px);border:1.5px solid var(--token-color-ink);background:var(--token-color-ink);color:var(--token-color-background);font-family:inherit;font-weight:700;font-size:14px;cursor:pointer}
.sb-tp-btn.sb-tp-ghost{flex:0 0 auto;background:transparent;color:var(--token-color-ink)}
@container sbtp (max-width:370px){.sb-tp-tasks{grid-template-columns:1fr}}
@container sbtp (min-width:700px){
  .sb-tp-tasks{grid-template-columns:repeat(3,1fr);gap:8px}
  .sb-tp-task{min-height:84px;align-items:start}
  .sb-tp-rec{margin-top:10px}
}
`;

export function renderTaskPickerBlock(args: {
  node: BuilderTaskPickerNode;
  offerings: readonly TalentOffering[];
  locale: string;
  confirmsByHand?: boolean;
  bookingPosture?: "instant" | "request" | "inquiry";
  styleAttr?: CSSProperties;
}): ReactNode {
  const { node, styleAttr } = args;
  const model = buildTaskPickerModel({
    props: node.props,
    offerings: args.offerings,
    locale: args.locale,
    confirmsByHand: args.confirmsByHand,
    bookingPosture: args.bookingPosture,
  });
  const empty = model.tasks.length === 0;
  const eyebrow = (node.props.eyebrow ?? "").trim();
  const title = (node.props.title ?? "").trim();
  return (
    <section
      className="sb-tp"
      data-builder-kind="task_picker"
      data-builder-node-kind="task_picker"
      data-builder-node-id={node.id}
      data-tp-empty={empty ? "1" : "0"}
      style={styleAttr}
      hidden={empty || undefined}
      aria-hidden={empty || undefined}
      {...anchorIdAttrs(node)}
    >
      {empty ? null : (
        <>
          <style>{TASK_PICKER_CSS}</style>
          {eyebrow || title ? (
            <header className="sb-tp-header">
              {eyebrow ? <p className="sb-tp-eyebrow">{eyebrow}</p> : null}
              {title ? <h2 className="sb-tp-title">{title}</h2> : null}
            </header>
          ) : null}
          <TaskPickerIsland
            model={model}
            locale={args.locale}
            confirmsByHand={args.confirmsByHand ?? true}
            bookingPosture={args.bookingPosture ?? "instant"}
          />
        </>
      )}
    </section>
  );
}
