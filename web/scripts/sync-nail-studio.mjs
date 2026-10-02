#!/usr/bin/env node
// Copies the owner's Nail Studio (design-references/apps/nail-designer-v2/nail-designer.html)
// to public/apps/nail-studio/index.html, changing ONLY the Google Fonts link to the
// same-origin proxy (/api/fonts/css). Never edit the public copy by hand.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "design-references/apps/nail-designer-v2/nail-designer.html");
const out = resolve(root, "public/apps/nail-studio/index.html");
const html = readFileSync(src, "utf8");
const next = html.replace(/https:\/\/fonts\.googleapis\.com\/css2\?/g, "/api/fonts/css?");
if (next === html) throw new Error("no Google Fonts link found to rewrite");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, next);
console.log("wrote", out);
