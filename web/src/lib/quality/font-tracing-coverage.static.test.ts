/**
 * Every route that can reach the embedded font files must have an
 * `outputFileTracingIncludes` entry.
 *
 * WHY THIS GUARD AND NOT A TEST. A missing tracing entry is invisible to every
 * gate the repo has: it typechecks, it lints, the unit tests pass, `next build`
 * succeeds, and a local `next dev` renders a perfect PDF — because locally the
 * .ttf files are simply on disk. It fails only on the real serverless bundle,
 * where the tracer did not copy them, and only at request time, as a 500 on a
 * download the operator is waiting for. The repo already has an incident file
 * about `next/image` from an API route where tests and curl both passed while
 * every photo was broken; this is that shape.
 *
 * The font files are loaded at RUNTIME with `readFile`, not imported, so the
 * bundler cannot see the dependency. Nothing but a rule like this can.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "./supabase-unchecked-read";

const FONT_LOADER = "media-kit-font";
const APP_DIR = join(WEB_ROOT, "src/app");

function files(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/**
 * Modules that reach the font loader, directly or through one hop. One hop is
 * enough in practice and keeps this readable: the loader is imported by
 * `media-kit-pdf.ts` and `print-export.ts`, and routes import those.
 */
function fontReachingModules(): Set<string> {
  const all = files(join(WEB_ROOT, "src/lib"));
  const direct = new Set<string>();
  for (const f of all) {
    if (f.includes(FONT_LOADER)) continue;
    if (readFileSync(f, "utf8").includes(FONT_LOADER)) direct.add(f);
  }
  return direct;
}

/** The URL path Next traces by, with route groups `(...)` removed. */
function routePathOf(file: string): string {
  return (
    "/" +
    relative(APP_DIR, file)
      .replace(/\/route\.tsx?$/, "")
      .split("/")
      .filter((seg) => !/^\(.*\)$/.test(seg))
      .join("/")
  );
}

test("every route reaching the font loader has an outputFileTracingIncludes entry", () => {
  const reaching = [...fontReachingModules()].map((f) =>
    relative(join(WEB_ROOT, "src"), f).replace(/\.tsx?$/, ""),
  );
  assert.ok(reaching.length > 0, "found no modules using the font loader — this guard has gone blind");

  const config = readFileSync(join(WEB_ROOT, "next.config.ts"), "utf8");

  const offenders: string[] = [];
  for (const route of files(APP_DIR).filter((f) => /\/route\.tsx?$/.test(f))) {
    const src = readFileSync(route, "utf8");
    const usesFont =
      src.includes(FONT_LOADER) || reaching.some((m) => src.includes(m.replace(/^lib\//, "@/lib/")));
    if (!usesFont) continue;
    const key = routePathOf(route);
    if (!config.includes(`"${key}"`)) offenders.push(`  ${key}  (${relative(WEB_ROOT, route)})`);
  }

  assert.deepEqual(
    offenders,
    [],
    offenders.length === 0
      ? ""
      : `\n\nThese routes embed fonts but are not in next.config.ts outputFileTracingIncludes:\n\n` +
        `${offenders.join("\n")}\n\n` +
        `Add each one, mapping to the .ttf files:\n` +
        `  "<route>": ["./src/lib/talent/fonts/*.ttf"],\n\n` +
        `Without it the route builds clean, typechecks clean, renders correctly in\n` +
        `next dev, and 500s in production with the fonts missing.\n`,
  );
});

test("the tracing entries point at font files that actually exist", () => {
  // An entry whose glob matches nothing is the same failure with a config line
  // in front of it, which is worse: it looks handled.
  const config = readFileSync(join(WEB_ROOT, "next.config.ts"), "utf8");
  const block = config.slice(config.indexOf("outputFileTracingIncludes"));
  assert.match(block, /fonts\/\*\.ttf/, "no font glob in outputFileTracingIncludes");

  const fonts = readdirSync(join(WEB_ROOT, "src/lib/talent/fonts")).filter((f) => f.endsWith(".ttf"));
  assert.ok(fonts.length >= 2, `expected the Noto regular+bold subset on disk, found ${fonts.length}`);
});
