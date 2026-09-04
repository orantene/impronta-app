/**
 * Render every email template to static HTML and lay them out at phone width.
 *
 * Email is the one surface we cannot check by opening the app: the templates
 * only exist as rendered HTML inside somebody's inbox, and the vast majority of
 * that inbox traffic is read on a phone. Without this, "does it look right on
 * mobile" is answered by reading JSX, which is how a 560px card with a fixed
 * table in it ships looking fine and arrives cut in half.
 *
 * Writes one file per template plus an index that frames them all at 390px —
 * iPhone 14 width, the narrow end of what actually matters. Output is
 * gitignored; this is a local inspection tool, not a build step.
 *
 *   npx tsx scripts/email-preview-gallery.ts && open .email-previews/index.html
 */
import { readdirSync, statSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { render } from "@react-email/render";
import { createElement } from "react";

const ROOT = join(process.cwd(), "emails");
const OUT = join(process.cwd(), ".email-previews");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "components" ? [] : walk(full);
    return name.endsWith(".tsx") && !name.startsWith("_") ? [full] : [];
  });
}

type Rendered = { id: string; label: string; file: string; note: string; html: string };

/** Inline the rendered email into srcdoc so the index works from any path. */
function attr(html: string): string {
  return html.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const results: Rendered[] = [];
  const failures: string[] = [];

  for (const file of walk(ROOT).sort()) {
    const id = relative(ROOT, file).replace(/\.tsx$/, "").replace(/\//g, "-");
    try {
      const mod = await import(pathToFileURL(file).href);
      const Component = mod.default;
      if (typeof Component !== "function") {
        failures.push(`${id}: no default export`);
        continue;
      }
      // PreviewProps is the template's own sample data. Rendering without it
      // produces a page of "undefined", which looks like a broken template
      // rather than a missing fixture — so say which it is.
      const props = Component.PreviewProps;
      if (!props) {
        failures.push(`${id}: no PreviewProps (cannot render with real data)`);
        continue;
      }
      const html = await render(createElement(Component, props));
      const outFile = `${id}.html`;
      writeFileSync(join(OUT, outFile), html);
      results.push({
        id,
        label: id.replace(/-/g, " / "),
        file: outFile,
        note: `${(html.length / 1024).toFixed(0)} KB`,
        html,
      });
    } catch (err) {
      failures.push(`${id}: ${(err as Error).message.split("\n")[0]}`);
    }
  }

  const cards = results
    .map(
      (r) => `
    <figure>
      <figcaption><span>${r.label}</span><span class="k">${r.note}</span></figcaption>
      <iframe srcdoc="${attr(r.html)}" loading="lazy" title="${r.label}"></iframe>
    </figure>`,
    )
    .join("");

  writeFileSync(
    join(OUT, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Email previews at phone width</title>
<style>
  body{margin:0;padding:24px;background:#e9ebee;font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;color:#1a1d22}
  h1{font-size:18px;margin:0 0 4px}
  p.sub{margin:0 0 24px;color:#6b7280}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,390px);gap:24px}
  figure{margin:0;background:#fff;border:1px solid #d6dae0;border-radius:6px;overflow:hidden}
  figcaption{display:flex;justify-content:space-between;gap:8px;padding:8px 10px;font:11px/1.4 ui-monospace,monospace;background:#f5f6f8;border-bottom:1px solid #e3e6ea}
  .k{color:#8b93a1}
  iframe{display:block;width:390px;height:620px;border:0;background:#fff}
  .fail{background:#fdecea;border:1px solid #f0b4ae;border-radius:6px;padding:12px 14px;margin-bottom:24px;font:12px/1.6 ui-monospace,monospace;color:#8c2f26}
</style>
<h1>${results.length} email templates at 390px</h1>
<p class="sub">iPhone 14 width. Each frame is the real rendered email, from the template's own sample data.</p>
${failures.length ? `<div class="fail"><b>${failures.length} did not render</b><br>${failures.join("<br>")}</div>` : ""}
<div class="grid">${cards}</div>`,
  );

  console.log(`rendered ${results.length} templates -> ${OUT}/index.html`);
  if (failures.length) {
    console.log(`FAILED ${failures.length}:`);
    for (const f of failures) console.log(`  ${f}`);
  }
}

void main();
