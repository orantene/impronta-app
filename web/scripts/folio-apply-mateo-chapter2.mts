/**
 * Place the mockup's Folio chapter II images (f-d-stride lead, f-d-feet, f-d-shirt) at
 * Mateo's gallery slots 3-5 (TAL-93011). Demo-only, idempotent (keyed by
 * metadata.folio_image_key). Source files: web/design-references/folio/img/<key>.jpg.
 * Run from web/ with the demo env:
 *   DEMO_SEED_TARGET_REF=<ref> npx tsx scripts/folio-apply-mateo-chapter2.mts [--dry]
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const { planFolioChapter2 } = await import("../src/lib/talent-site/demos/folio-chapter-media");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
  throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
}
const PROFILE_ID = "30f45c0f-6c40-44d4-bfb7-f04bfd0a6adc";
const USER_ID = "ec3e63db-83a1-43e3-9fd7-223d56b87bc5";
const BUCKET = "media-public";
const dry = process.argv.includes("--dry");

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: u } = await admin.auth.admin.getUserById(USER_ID);
if (u.user?.app_metadata?.demo_batch !== "demo-2026-09-28") throw new Error("REFUSE: not Mateo demo batch");

const { data: rows, error } = await admin
  .from("media_assets")
  .select("id, tenant_id, sort_order, metadata")
  .eq("owner_talent_profile_id", PROFILE_ID)
  .eq("variant_kind", "gallery");
if (error) throw error;
const gallery = (rows ?? []).map((r) => ({
  id: r.id as string,
  sort_order: r.sort_order as number,
  metadata: r.metadata as Record<string, unknown> | null,
}));
const plan = planFolioChapter2(gallery);
console.log(JSON.stringify(plan));
if (dry) process.exit(0);

// Displaced rows first (they move to 6+), so the new rows take 3-5 without a clash.
for (const r of plan.reorder) {
  const { error: e } = await admin.from("media_assets").update({ sort_order: r.sort_order }).eq("id", r.id);
  if (e) throw e;
}
const tenantId = rows?.[0]?.tenant_id as string;
for (const up of plan.upload) {
  const body = fs.readFileSync(path.resolve("design-references/folio/img", `${up.key}.jpg`));
  const storagePath = `tenant/${tenantId}/talent/${PROFILE_ID}/${randomUUID()}.jpg`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, body, { contentType: "image/jpeg" });
  if (upErr) throw upErr;
  const { error: insErr } = await admin.from("media_assets").insert({
    tenant_id: tenantId,
    owner_talent_profile_id: PROFILE_ID,
    bucket_id: BUCKET,
    storage_path: storagePath,
    variant_kind: "gallery",
    approval_state: "approved",
    purpose: "talent",
    sort_order: up.sort_order,
    file_size: body.length,
    mime_type: "image/jpeg",
    alt: "Mateo Ferrer, runway",
    attribution_note: "Folio mockup image (design-references/folio/img)",
    metadata: { folio_image_key: up.key, demo_batch: "demo-2026-09-28" },
    ownership_kind: "talent",
    owner_tenant_id: null,
    uploaded_by_user_id: USER_ID,
    created_by: USER_ID,
  });
  if (insErr) throw insErr;
}
console.log("chapter II placed for TAL-93011");
