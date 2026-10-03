#!/usr/bin/env node
/**
 * Track C — Resend receiving setup helper (run on Mac with web/.env.local).
 *
 * Uses RESEND_ADMIN_API_KEY (preferred) or RESEND_API_KEY. Never print keys.
 *
 *   cd web && node scripts/resend-receiving-setup.mjs
 *   cd web && node scripts/resend-receiving-setup.mjs --enable
 *   cd web && node scripts/resend-receiving-setup.mjs --ensure-domains
 *   cd web && node scripts/resend-receiving-setup.mjs --ensure-domains --enable
 *
 * Targets:
 *   - tulala.digital → hello@ / help@ / support@ (catch-all once MX is live)
 *   - demo.tulala.digital → demo talent inboxes (password reset receive path)
 *
 * --ensure-domains creates a missing domain in Resend (then print DNS rows).
 * --enable turns on receiving when the API supports it; otherwise follow the
 * printed Dashboard steps.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resend } from "resend";

const TARGETS = ["tulala.digital", "demo.tulala.digital"];
const enableFlag = process.argv.includes("--enable");
const ensureDomainsFlag = process.argv.includes("--ensure-domains");

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = { ...process.env, ...loadEnvLocal() };
const apiKey = env.RESEND_ADMIN_API_KEY || env.RESEND_API_KEY;
if (!apiKey) {
  console.error(
    "Missing RESEND_ADMIN_API_KEY (or RESEND_API_KEY) in web/.env.local",
  );
  process.exit(1);
}

const resend = new Resend(apiKey);

async function listDomains() {
  const { data: list, error: listError } = await resend.domains.list();
  if (listError) {
    console.error("domains.list failed:", listError.message ?? listError);
    process.exit(1);
  }
  return list?.data ?? [];
}

let domains = await listDomains();
console.log("\nResend domains (receiving + DNS):\n");

for (const name of TARGETS) {
  let row = domains.find((d) => d.name === name);

  if (!row && ensureDomainsFlag) {
    console.log(`— ${name}: NOT FOUND — creating via Resend API…`);
    const { data: created, error: createError } = await resend.domains.create({
      name,
    });
    if (createError || !created?.id) {
      console.log(
        `    create failed — add domain in Dashboard → Domains → Add (${createError?.message ?? "unknown"})`,
      );
      console.log("");
      continue;
    }
    console.log(`    created id=${created.id} — verify SPF/DKIM DNS next`);
    domains = await listDomains();
    row = domains.find((d) => d.name === name) ?? created;
  }

  if (!row) {
    console.log(
      `— ${name}: NOT FOUND in Resend — re-run with --ensure-domains or add/verify in Dashboard`,
    );
    console.log("");
    continue;
  }

  const { data: detail, error: getError } = await resend.domains.get(row.id);
  if (getError || !detail) {
    console.log(
      `— ${name}: could not load domain detail (${getError?.message ?? "unknown"})`,
    );
    console.log("");
    continue;
  }

  console.log(`— ${name}`);
  console.log(`    id: ${detail.id}`);
  console.log(`    status: ${detail.status}`);
  console.log(
    `    capabilities: sending=${detail.capabilities?.sending ?? "?"} receiving=${detail.capabilities?.receiving ?? "?"}`,
  );
  const records = detail.records ?? [];
  for (const rec of records) {
    const kind = rec.record ?? rec.type ?? "record";
    console.log(
      `    ${kind} ${rec.name ?? "@"} → ${rec.value ?? rec.content ?? "?"} (priority ${rec.priority ?? "n/a"}, status ${rec.status ?? "?"})`,
    );
  }

  if (enableFlag && row.id) {
    const { error: patchError } = await resend.domains.update({
      id: row.id,
      capabilities: { receiving: "enabled" },
    });
    if (patchError) {
      console.log(
        `    enable receiving: API error — use Dashboard → Domains → ${name} → Receiving toggle`,
      );
      console.log(`    (${patchError.message ?? patchError})`);
    } else {
      console.log(
        "    enable receiving: requested via API — re-run to see MX rows",
      );
    }
  } else if (!enableFlag) {
    console.log(
      "    tip: re-run with --enable after DNS is ready, or toggle Receiving in Dashboard",
    );
  }
  console.log("");
}

console.log(
  "Vercel DNS (tulala.digital project): add the MX row Resend shows for each domain.",
);
console.log(
  "Catch-all: once MX is verified, hello@ / help@ / support@ and *@demo.tulala.digital all hit the same webhook.",
);
console.log(
  "Webhook: POST https://tulala.digital/api/webhooks/resend — event email.received",
);
console.log(
  "Store+forward: email.received → resend_inbound_emails → Gmail (RESEND_INBOUND_FORWARD_TO).",
);
console.log(
  "Apply migration first: cd web && npm run db:push  (20261231320000_resend_inbound_emails)",
);
console.log(
  "Forward target: RESEND_INBOUND_FORWARD_TO (default orantene@gmail.com)",
);
console.log(
  "After proof: set NEXT_PUBLIC_SUPPORT_EMAIL_CAN_RECEIVE=1 in Vercel production + redeploy.\n",
);
