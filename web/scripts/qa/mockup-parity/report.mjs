import { writeFileSync } from "node:fs";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const img = (buf) => (buf ? `<img loading="lazy" src="data:image/jpeg;base64,${buf.toString("base64")}">` : '<div class="noimg">no image</div>');

/** rows: [{talent, code, width, section, label, status, reasons[], warnings[], product: Buffer?, mockup: Buffer?}] */
export function writeReport(file, { meta, rows, summary }) {
  const body = rows
    .map((r, i) => `<tr class="${r.status.toLowerCase()}" data-s="${r.status}" data-t="${esc(r.talent)}">
  <td>${esc(r.talent)}<br><small>${esc(r.code)}</small></td><td>${r.width}</td><td>${esc(r.label)}</td>
  <td><b class="b ${r.status.toLowerCase()}">${r.status}</b></td>
  <td>${r.reasons.map((x) => `<div class="rs">${esc(x)}</div>`).join("") || '<span class="ok">ok</span>'}${r.warnings.map((x) => `<div class="wn">${esc(x)}</div>`).join("")}</td>
  <td class="sbs"><figure><figcaption>product</figcaption>${img(r.product)}</figure><figure><figcaption>mockup</figcaption>${img(r.mockup)}</figure></td></tr>`)
    .join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mockup parity report</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--bg:#fafaf9;--fg:#1c1917;--mut:#78716c;--line:#e7e5e4;--pass:#15803d;--fail:#b91c1c;--warn:#a16207;--blk:#6d28d9}
@media(prefers-color-scheme:dark){:root{--bg:#161412;--fg:#f5f5f4;--mut:#a8a29e;--line:#2e2a27}}
body{margin:0;padding:20px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
h1{margin:0 0 4px;font-size:20px}.meta,.mut{color:var(--mut)}small{color:var(--mut)}
.sum{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.sum div{border:1px solid var(--line);border-radius:10px;padding:8px 14px}
.bar{display:flex;gap:8px;margin:10px 0;flex-wrap:wrap}.bar button,.bar select{padding:5px 12px;border:1px solid var(--line);border-radius:999px;background:none;color:var(--fg);cursor:pointer}
table{border-collapse:collapse;width:100%}th,td{border-top:1px solid var(--line);padding:8px;vertical-align:top;text-align:left}
.b{padding:2px 8px;border-radius:6px;color:#fff;font-size:12px}.b.pass{background:var(--pass)}.b.fail{background:var(--fail)}.b.blocked{background:var(--blk)}
.rs{color:var(--fail)}.wn{color:var(--warn)}.ok{color:var(--pass)}
.sbs{display:flex;gap:10px}figure{margin:0}figcaption{font-size:11px;color:var(--mut)}
.sbs img{max-width:340px;max-height:420px;border:1px solid var(--line);border-radius:6px;display:block}.noimg{width:120px;height:40px;color:var(--mut);font-size:12px}
@media(max-width:800px){.sbs{flex-direction:column}}
</style></head><body>
<h1>Mockup parity report</h1>
<div class="meta">${esc(meta.timestamp)} · product ${esc(meta.baseUrl)} · mockup ${esc(meta.mockupUrl)} · locale ${esc(meta.locale)} · widths ${esc(meta.widths.join(", "))} · states ${esc(meta.states.join(", "))}</div>
<div class="sum"><div><b>${summary.pass}</b> PASS</div><div><b>${summary.fail}</b> FAIL</div><div><b>${summary.blocked}</b> BLOCKED</div><div><b>${summary.talents}</b> talents</div></div>
<div class="bar"><button data-f="all">All</button><button data-f="FAIL">FAIL</button><button data-f="BLOCKED">BLOCKED</button><button data-f="PASS">PASS</button></div>
<table><thead><tr><th>Talent</th><th>Width</th><th>Section</th><th>Status</th><th>Reasons</th><th>Product vs mockup</th></tr></thead><tbody>
${body}
</tbody></table>
<script>document.querySelector('.bar').addEventListener('click',function(e){var f=e.target.dataset.f;if(!f)return;document.querySelectorAll('tbody tr').forEach(function(r){r.hidden=!(f==='all'||r.dataset.s===f)})});</script>
</body></html>`;
  writeFileSync(file, html);
}
