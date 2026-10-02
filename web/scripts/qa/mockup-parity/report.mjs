import { writeFileSync } from "node:fs";
import { LAYERS, groupByLayer } from "./classify.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const img = (buf) => (buf ? `<img loading="lazy" alt="" src="data:image/jpeg;base64,${buf.toString("base64")}">` : '<div class="noimg">no image</div>');
const pct = (r) => `${(r * 100).toFixed(1)}%`;

/** Hard ceiling for the self-contained file. Chat/Artifact hosts refuse more than 16 MB. */
export const REPORT_BUDGET_BYTES = 15 * 1024 * 1024;
const IMG_KEYS = ["product", "mockup", "diff"];

/**
 * Re-encode every image smaller until the base64 payload fits the budget. Returns the final
 * { maxW, quality, bytes }. Uses the image tool's jpeg(); each pass starts from the CURRENT buffers.
 */
export async function fitImages(rows, tool, budget = REPORT_BUDGET_BYTES) {
  const payload = () => rows.reduce((n, r) => n + IMG_KEYS.reduce((m, k) => m + (r[k] ? Math.ceil((r[k].length * 4) / 3) : 0), 0), 0);
  let maxW = 520, quality = 0.6, passes = 0;
  while (payload() > budget * 0.9 && passes < 5 && tool) {
    maxW = Math.round(maxW * 0.75);
    quality = Math.max(0.35, quality - 0.08);
    for (const r of rows) for (const k of IMG_KEYS) if (r[k]) r[k] = await tool.jpeg(r[k], { maxW, quality });
    passes++;
  }
  return { maxW, quality, bytes: payload(), passes };
}

function deltaTable(deltas) {
  if (!deltas.length) return '<p class="ok">No deltas.</p>';
  const groups = groupByLayer(deltas);
  return LAYERS.map((layer) => {
    const list = groups.get(layer);
    if (!list.length) return "";
    const open = list.filter((d) => !d.accepted).length;
    const rows = list
      .map(
        (d) => `<tr class="${d.accepted ? "known" : "fail"}"><td>${esc(d.section)}</td><td>${d.width}</td><td>${esc(d.talent)}</td><td>${esc(d.check)}</td>
<td>${esc(d.evidence)}${d.inferred ? ' <small>(layer inferred)</small>' : ""}</td><td><code>${esc(d.suggestedFile)}</code></td>
<td>${d.accepted ? `<b class="b known">${esc(d.accepted)}</b>` : '<b class="b fail">open</b>'}</td></tr>`,
      )
      .join("");
    return `<h3><span class="layer ${layer}">${layer}</span> ${list.length} deltas, ${open} open</h3>
<table class="d"><thead><tr><th>Section</th><th>Width</th><th>Demo</th><th>Check</th><th>Evidence</th><th>Suggested file</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join("\n");
}

function pixelTable(rows) {
  const px = rows.filter((r) => r.pixel);
  if (!px.length) return '<p class="mut">Pixel diff runs on the reference demo only (Alba). No reference demo in this run.</p>';
  const body = px
    .map(
      (r) => `<tr class="${r.pixel.ok ? "pass" : "fail"}"><td>${esc(r.label)}</td><td>${r.width}</td><td>${pct(r.pixel.ratio)}</td><td>${pct(r.pixel.threshold)}</td>
<td>${r.pixel.heightDelta > 0 ? "+" : ""}${r.pixel.heightDelta}px</td><td><b class="b ${r.pixel.ok ? "pass" : "fail"}">${r.pixel.ok ? "PASS" : "FAIL"}</b></td></tr>`,
    )
    .join("");
  return `<table class="d"><thead><tr><th>Section</th><th>Width</th><th>Mismatch</th><th>Threshold</th><th>Height vs mockup</th><th></th></tr></thead><tbody>${body}</tbody></table>`;
}

/** rows: [{talent, code, width, section, label, status, reasons[], warnings[], product, mockup, diff, pixel?, known?}] */
export function writeReport(file, { meta, rows, summary, deltas = [], staleBaseline = [], budget = null }) {
  const body = rows
    .map((r) => {
      const st = r.status === "FAIL" && r.known ? "KNOWN" : r.status;
      return `<tr class="${st.toLowerCase()}" data-s="${st}" data-t="${esc(r.talent)}">
  <td>${esc(r.talent)}<br><small>${esc(r.code)}</small></td><td>${r.width}</td><td>${esc(r.label)}</td>
  <td><b class="b ${st.toLowerCase()}">${st}</b></td>
  <td>${r.reasons.map((x) => `<div class="rs">${esc(x)}</div>`).join("") || '<span class="ok">ok</span>'}${r.warnings.map((x) => `<div class="wn">${esc(x)}</div>`).join("")}</td>
  <td class="sbs"><figure><figcaption>product</figcaption>${img(r.product)}</figure><figure><figcaption>mockup</figcaption>${img(r.mockup)}</figure>${r.diff ? `<figure><figcaption>diff${r.pixel ? ` ${pct(r.pixel.ratio)}` : ""}</figcaption>${img(r.diff)}</figure>` : ""}</td></tr>`;
    })
    .join("\n");
  const open = deltas.filter((d) => !d.accepted).length;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mockup parity report</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--bg:#fafaf9;--fg:#1c1917;--mut:#78716c;--line:#e7e5e4;--pass:#15803d;--fail:#b91c1c;--warn:#a16207;--blk:#6d28d9;--known:#0369a1}
@media(prefers-color-scheme:dark){:root{--bg:#161412;--fg:#f5f5f4;--mut:#a8a29e;--line:#2e2a27}}
body{margin:0;padding:20px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
h1{margin:0 0 4px;font-size:20px}h2{margin:28px 0 8px;font-size:16px}h3{margin:18px 0 6px;font-size:14px}.meta,.mut{color:var(--mut)}small{color:var(--mut)}code{font-size:11px;word-break:break-all}
.sum{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.sum div{border:1px solid var(--line);border-radius:10px;padding:8px 14px}
.bar{display:flex;gap:8px;margin:10px 0;flex-wrap:wrap}.bar button{padding:5px 12px;border:1px solid var(--line);border-radius:999px;background:none;color:var(--fg);cursor:pointer}
table{border-collapse:collapse;width:100%}th,td{border-top:1px solid var(--line);padding:8px;vertical-align:top;text-align:left}
table.d td,table.d th{padding:5px 8px;font-size:13px}
.b{padding:2px 8px;border-radius:6px;color:#fff;font-size:12px}.b.pass{background:var(--pass)}.b.fail{background:var(--fail)}.b.blocked{background:var(--blk)}.b.known{background:var(--known)}
.layer{padding:2px 8px;border-radius:6px;background:var(--line);font-size:12px}
.rs{color:var(--fail)}.wn{color:var(--warn)}.ok{color:var(--pass)}
.sbs{display:flex;gap:10px}figure{margin:0}figcaption{font-size:11px;color:var(--mut)}
.sbs img{max-width:300px;max-height:420px;border:1px solid var(--line);border-radius:6px;display:block}.noimg{width:120px;height:40px;color:var(--mut);font-size:12px}
@media(max-width:800px){.sbs{flex-direction:column}}
</style></head><body>
<h1>Mockup parity report</h1>
<div class="meta">${esc(meta.timestamp)} · design ${esc(meta.design)} · source ${esc(meta.source)} · product ${esc(meta.baseUrl)} · mockup ${esc(meta.mockupUrl)} · locale ${esc(meta.locale)} · widths ${esc(meta.widths.join(", "))} · states ${esc(meta.states.join(", "))}</div>
<div class="sum"><div><b>${summary.pass}</b> PASS</div><div><b>${summary.fail}</b> FAIL</div><div><b>${summary.known}</b> KNOWN</div><div><b>${summary.blocked}</b> BLOCKED</div><div><b>${summary.talents}</b> talents</div><div><b>${open}</b> open deltas</div><div><b>${esc(summary.verdict)}</b></div></div>
<h2>Deltas by layer</h2>
${deltaTable(deltas)}
${staleBaseline.length ? `<h3>Baseline entries that no longer fail (remove them)</h3><ul>${staleBaseline.map((a) => `<li>${esc(a.section)} / ${esc(a.check)} (${esc(a.ticket)})</li>`).join("")}</ul>` : ""}
<h2>Pixel diff per section (reference demo)</h2>
${pixelTable(rows)}
<h2>All checks</h2>
<div class="bar"><button data-f="all">All</button><button data-f="FAIL">FAIL</button><button data-f="KNOWN">KNOWN</button><button data-f="BLOCKED">BLOCKED</button><button data-f="PASS">PASS</button></div>
<table><thead><tr><th>Talent</th><th>Width</th><th>Section</th><th>Status</th><th>Reasons</th><th>Product, mockup, diff</th></tr></thead><tbody>
${body}
</tbody></table>
${budget ? `<p class="mut">Images downscaled to ${budget.maxW}px wide, JPEG quality ${Math.round(budget.quality * 100)}, ${(budget.bytes / 1048576).toFixed(1)} MB of images. This file is self-contained.</p>` : ""}
<script>document.querySelector('.bar').addEventListener('click',function(e){var f=e.target.dataset.f;if(!f)return;document.querySelectorAll('tbody tr').forEach(function(r){if(r.dataset.s)r.hidden=!(f==='all'||r.dataset.s===f)})});</script>
</body></html>`;
  writeFileSync(file, html);
  return Buffer.byteLength(html);
}
