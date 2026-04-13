#!/usr/bin/env node
/**
 * TYPE A: list missing keys in es.json vs en.json (and optional stale detection placeholder).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function flattenKeys(obj, prefix = "") {
  const out = [];
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const v = obj[i];
      const path = prefix ? `${prefix}.${i}` : String(i);
      if (typeof v === "string") out.push(path);
      else out.push(...flattenKeys(v, path));
    }
    return out;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "string") out.push(path);
      else out.push(...flattenKeys(v, path));
    }
  }
  return out;
}

const en = JSON.parse(readFileSync(join(root, "messages/en.json"), "utf8"));
const es = JSON.parse(readFileSync(join(root, "messages/es.json"), "utf8"));

const enKeys = new Set(flattenKeys(en));
const esKeys = new Set(flattenKeys(es));

const missingInEs = [...enKeys].filter((k) => !esKeys.has(k));
const extraInEs = [...esKeys].filter((k) => !enKeys.has(k));

if (missingInEs.length || extraInEs.length) {
  if (missingInEs.length) {
    console.error("Missing in messages/es.json:", missingInEs.join(", "));
  }
  if (extraInEs.length) {
    console.error("Extra keys only in es.json:", extraInEs.join(", "));
  }
  process.exit(1);
}

console.log("messages/en.json and messages/es.json keys are aligned.");
