/**
 * Backfill participants for ORPHAN hub inquiries: source_channel `directory_guest`, status past
 * `draft`, zero inquiry_participants (TUL-208 Live QA 2026-10-09; the creation bug is fixed in
 * promote-early-inquiry.ts). DRY-RUN BY DEFAULT: it prints one line per candidate and writes nothing.
 *
 * Usage (env must hold NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY of the target):
 *   cd web && NODE_OPTIONS="--require ./scripts/register-server-only-test.cjs" \
 *     npx tsx --tsconfig tsconfig.json scripts/backfill-orphan-inquiry-participants.mts [flags]
 *
 * Flags:
 *   --apply              write (default is dry-run)
 *   --production         required to touch anything that is not the isolated project (fxlankepwnvelxjrahwk)
 *   --only=<id8,...>     restrict to inquiries whose id starts with one of these (REQUIRED with --apply --production)
 *   --include-real       allow attaching the real talent (TAL-93938); the line is flagged REAL either way
 *   --notify             also emit the submit event + invite bell for the talent (off: a backfill stays quiet)
 *
 * An inquiry is attached only when its talent resolves UNAMBIGUOUSLY (orphan-inquiry-resolve.ts):
 * exactly one talent, all sources agree, and the talent row exists. Everything else is SKIPPED with a reason.
 * Seating is the same code the live promotion uses (seat-participants.ts). Idempotent: an inquiry that
 * already has a participant is never a candidate.
 */
import { createClient } from "@supabase/supabase-js";

import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "../src/lib/inquiry/inquiry-events";
import { buildInquiryBells } from "../src/lib/inquiry/inquiry-notifications";
import { resolveOrphanTalent } from "../src/lib/inquiry/orphan-inquiry-resolve";
import { resolveSeating, seatParticipants } from "../src/lib/inquiry/seat-participants";

const ISOLATED_REF = "fxlankepwnvelxjrahwk";
const REAL_TALENT_CODES = new Set(["TAL-93938"]); // Jorgelina's real profile; TAL-93900 is the test one
const args = new Set(process.argv.slice(2).filter((a) => !a.includes("=")));
const only = (process.argv.slice(2).find((a) => a.startsWith("--only="))?.slice(7) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const APPLY = args.has("--apply");
const PRODUCTION = args.has("--production");
const NOTIFY = args.has("--notify");
const INCLUDE_REAL = args.has("--include-real");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const isolated = url.includes(ISOLATED_REF);
if (!isolated && !PRODUCTION) throw new Error(`REFUSED: ${new URL(url).host} is not the isolated project. Pass --production to dry-run or apply against it deliberately.`);
if (APPLY && !isolated && only.length === 0) throw new Error("REFUSED: --apply --production needs --only=<id8,...> (name the inquiries you read back).");

const admin = createClient(url, key, { auth: { persistSession: false } });
console.log(`target: ${new URL(url).host} (${isolated ? "ISOLATED" : "PRODUCTION"}) · mode: ${APPLY ? "APPLY" : "DRY-RUN"}${NOTIFY ? " + notify" : ""}`);

const { data: rows, error } = await admin
  .from("inquiries")
  .select("id, tenant_id, status, created_at, source_channel, source_page, interpreted_query, client_user_id, coordinator_id")
  .eq("source_channel", "directory_guest")
  .neq("status", "draft")
  .order("created_at", { ascending: true });
if (error) throw error;

const ids = (rows ?? []).map((r) => r.id as string);
const { data: parts, error: pErr } = ids.length
  ? await admin.from("inquiry_participants").select("inquiry_id").in("inquiry_id", ids)
  : { data: [], error: null };
if (pErr) throw pErr;
const withParticipants = new Set((parts ?? []).map((p) => p.inquiry_id as string));
const orphans = (rows ?? []).filter((r) => !withParticipants.has(r.id as string) && (only.length === 0 || only.some((o) => String(r.id).startsWith(o))));
console.log(`candidates: ${orphans.length} non-draft directory_guest inquiries with zero participants\n`);

let attachable = 0, skipped = 0, applied = 0;
for (const o of orphans) {
  const id = o.id as string;
  const [{ count: guestMsgs }, { count: staffMsgs }] = await Promise.all([
    admin.from("inquiry_messages").select("id", { count: "exact", head: true }).eq("inquiry_id", id).not("guest_session_id", "is", null).is("deleted_at", null),
    admin.from("inquiry_messages").select("id", { count: "exact", head: true }).eq("inquiry_id", id).not("sender_user_id", "is", null).is("deleted_at", null),
  ]);
  const head = `${id.slice(0, 8)} · ${o.status} · ${String(o.created_at).slice(0, 16)} · guest msgs ${guestMsgs ?? 0} · staff replies ${staffMsgs ?? 0}`;
  const res = resolveOrphanTalent({ interpreted_query: o.interpreted_query, source_page: o.source_page as string | null });
  if (!res.ok) {
    skipped++;
    console.log(`SKIP   ${head}\n       ${res.reason}`);
    continue;
  }
  const q = admin.from("talent_profiles").select("id, profile_code, display_name");
  const { data: tps, error: tErr } = res.talentId ? await q.eq("id", res.talentId) : await q.eq("profile_code", res.profileCode!);
  if (tErr || !tps || tps.length !== 1) {
    skipped++;
    console.log(`SKIP   ${head}\n       talent row not found or not unique (${tErr?.message ?? `${tps?.length ?? 0} rows`})`);
    continue;
  }
  const tp = tps[0]!;
  if (res.profileCode && res.talentId && tp.profile_code !== res.profileCode) {
    skipped++;
    console.log(`SKIP   ${head}\n       lineup talent ${tp.profile_code} disagrees with profile code ${res.profileCode}`);
    continue;
  }
  const real = REAL_TALENT_CODES.has(String(tp.profile_code));
  attachable++;
  console.log(`ATTACH ${head}\n       talent ${tp.profile_code} (${tp.display_name}) · resolved by ${res.how}${real ? " · REAL TALENT: read back first, needs --include-real" : ""}`);
  if (!APPLY) continue;
  if (real && !INCLUDE_REAL) {
    console.log("       not applied (real talent without --include-real)");
    continue;
  }
  const tenantId = o.tenant_id as string;
  const seating = await resolveSeating(admin, { tenantId, talentIds: [tp.id as string], sourceChannel: "directory_guest" });
  const upd = await admin
    .from("inquiries")
    .update({
      coordinator_id: (o.coordinator_id as string | null) ?? seating.coordinatorOfRecordId,
      source_type: seating.sourceType as never,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (upd.error) {
    console.log(`       FAILED to update inquiry: ${upd.error.message}`);
    continue;
  }
  await seatParticipants(admin, { inquiryId: id, tenantId, clientUserId: (o.client_user_id as string | null) ?? null, seating });
  const { data: after } = await admin.from("inquiry_participants").select("role, status").eq("inquiry_id", id);
  console.log(`       applied: participants now ${JSON.stringify(after)}`);
  applied++;
  if (NOTIFY) {
    await emitStandardEngineEvent(admin, {
      type: ENGINE_EVENT_TYPES.INQUIRY_SUBMITTED,
      inquiryId: id,
      actorUserId: null,
      data: { talentCount: 1, backfilled: true, isGuest: true },
      notifications: await buildInquiryBells({
        inquiryId: id,
        tenantId,
        audiences: ["talent"],
        title: "You've been invited to an inquiry",
        body: "A client requested you for a new inquiry. Review the details to respond.",
        excludeUserId: null,
      }),
    });
    console.log("       talent notified");
  }
}
console.log(`\nsummary: candidates ${orphans.length} · attachable ${attachable} · skipped ${skipped}${APPLY ? ` · applied ${applied}` : " · nothing written (dry-run)"}`);
