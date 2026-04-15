#!/usr/bin/env node
/**
 * Run from web/: node --env-file=.env.local scripts/verify-google-maps-env.mjs
 * Prints whether map-related env vars are set (never prints secret values).
 */
const pub = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const places = process.env.GOOGLE_PLACES_API_KEY;

function line(name, v) {
  const t = v?.trim();
  if (!t) console.log(`${name}: (unset)`);
  else console.log(`${name}: set (${t.length} characters)`);
}

console.log("Google Maps / Places (web/.env.local)\n");
line("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", pub);
line("GOOGLE_PLACES_API_KEY", places);

const resolved = pub?.trim() || places?.trim();
console.log("");
if (!resolved) {
  console.log("Homepage map: no key — add GOOGLE_PLACES_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.");
  process.exitCode = 1;
} else {
  console.log("Homepage map: server can pass a key to the client.");
}

console.log("");
console.log("GCP: enable Maps JavaScript API + billing; key restrictions → HTTP referrers");
console.log("e.g. http://localhost:3000/* (match your dev URL port).");
console.log("Restart `npm run dev` after changing .env.local.");
