/**
 * TUL-946: the server-rendered talent shell skeleton shown while a signed-in
 * dashboard renders must carry a visible loading line in both languages, not
 * pulse blocks alone.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("the caption is a status line in ES and EN, English by default", () => {
  const src = read("src/components/talent/skeleton-caption.tsx");
  assert.match(src, /role="status"/);
  assert.match(src, /Loading your space…/);
  assert.match(src, /Cargando tu espacio…/);
  assert.match(src, /\[html\[lang\^='es'\]_&\]:hidden/, "English hides under html[lang^=es]");
  assert.match(src, /hidden \[html\[lang\^='es'\]_&\]:inline/, "Spanish is hidden by default");
  assert.match(src, /text-black\/60/, "contrast: not a lighter ink");
});

test("the server-rendered shell skeleton renders the caption", () => {
  const shell = read("src/app/(workspace)/talent/_talent-shell-skeleton.tsx");
  assert.match(shell, /import \{ SkeletonCaption \} from "@\/components\/talent\/skeleton-caption"/);
  assert.match(shell, /<SkeletonCaption \/>/);
});

test("TodaySkeleton (client admin bundle) is left alone: bundle headroom is 512 B", () => {
  const today = read("src/components/admin/shell/internal/talent/pages/today-skeleton.tsx");
  assert.doesNotMatch(today, /SkeletonCaption/);
});

test("the skeletons stay static: no hooks, no data (TUL-303 / TUL-536)", () => {
  const src = read("src/components/talent/skeleton-caption.tsx");
  assert.doesNotMatch(src, /use(State|Effect|DashboardText|Locale)|"use client"/);
});
