"use server";

/**
 * inquiry-intent-actions.ts — server actions for the InquiryDrawer.
 *
 * Spec: web/docs/inquiry-engine-spec-2026-05-14.md §15 + §18
 * Plan: web/docs/client-execution-plan-2026-05-14.md §21.2
 *
 * Two entry points the UI calls:
 *   • saveDraftAction          — autosave a draft (10s + blur + visibility)
 *   • submitInquiryNowAction   — one-shot submit without a draft (fast path)
 *
 * Both funnel into the canonical engine
 * (createInquiryFromIntent / saveInquiryDraft) so the UI never assembles
 * SubmitInquiryInput by hand.
 *
 * Returns flat ActionState objects compatible with React's useActionState.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { ensureGuestClientByEmail } from "@/lib/inquiry/guest-client";
import { assertAllTalentOnTenantRoster } from "@/lib/saas/talent-roster";
import {
  type InquiryIntent,
} from "@/lib/inquiry/inquiry-intent";
import {
  createInquiryFromIntent,
  saveInquiryDraft,
  submitInquiryDraft,
  type CreateInquiryFromIntentResult,
} from "@/lib/inquiry/inquiry-intent-engine";
import { logServerError } from "@/lib/server/safe-error";

// ─────────────────────────────────────────────────────────────────────────────
// Action result shape — flat object compatible with useActionState.
// ─────────────────────────────────────────────────────────────────────────────

/** Guest-account provisioning outcome — drives the success-panel copy. */
export type GuestActivationStatus = "matched" | "created" | "unlinked";

export type InquiryIntentActionState =
  | { kind: "idle" }
  | { kind: "saved"; draftId: string; savedAt: string }
  | {
      kind: "submitted";
      inquiryId: string;
      tenantSlug: string;
      /** True when the submitter had no auth session (public guest path). */
      isGuest: boolean;
      /** Guest-account provisioning result — null for authed clients. */
      guestActivation?: GuestActivationStatus | null;
      /** Email the guest submitted with — used for the magic-link CTA. */
      guestEmail?: string | null;
    }
  | { kind: "error"; message: string; missingFields?: string[] };

const GUEST_HEADER = "x-impronta-guest";

// ─────────────────────────────────────────────────────────────────────────────
// Shared resolver: pull tenant + actor session + supabase client.
// ─────────────────────────────────────────────────────────────────────────────

async function resolveSubmitContext(tenantSlug: string) {
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) return { ok: false as const, error: "tenant_not_found" };

  const session = await getCachedActorSession();
  // Note: session.user is NULL on guest path. That's OK — submitInquiry +
  // createInquiryFromIntent both handle the guest case.
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false as const, error: "db_unavailable" };
  const admin = createServiceRoleClient();
  // Service-role client is used for writes after the permission gate inside
  // submitInquiry. We pass it to the engine so RLS doesn't block the
  // inquiry-row INSERT for fresh client accounts.
  const writeClient = admin ?? supabase;

  // Guest path — resolve the guest_sessions row keyed by the
  // middleware-injected `x-impronta-guest` header. The id links the
  // inquiry to the unauthenticated visitor (magic-link claim later) and
  // is the rate-limit key the engine uses when actorUserId is null.
  let guestSessionId: string | null = null;
  if (!session.user) {
    const guestKey = (await headers()).get(GUEST_HEADER);
    if (guestKey) {
      const guestDb = admin ?? supabase;
      await guestDb.rpc("ensure_guest_session", { p_session_key: guestKey });
      const { data: guestRow } = await guestDb
        .from("guest_sessions")
        .select("id")
        .eq("session_key", guestKey)
        .maybeSingle();
      guestSessionId = (guestRow?.id as string | undefined) ?? null;
    }
  }

  return {
    ok: true as const,
    tenantSlug,
    tenantId: scope.tenantId,
    supabase,
    writeClient,
    actorUserId: session.user?.id ?? null,
    actorEmail: session.user?.email ?? null,
    guestSessionId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Save (autosave) a draft.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upserts an inquiry_drafts row. Called from the drawer autosave hook on a
 * 10-second cadence (configurable) + on blur + on visibility change.
 *
 * Does NOT submit. Does NOT redirect. Returns the draft id so the client
 * can keep autosaving to the same row.
 */
export async function saveDraftAction(
  prevState: InquiryIntentActionState,
  formData: FormData,
): Promise<InquiryIntentActionState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  if (!tenantSlug) return { kind: "error", message: "Missing tenant slug." };

  const intentJson = String(formData.get("intent") ?? "");
  const draftId = String(formData.get("draftId") ?? "") || null;
  let intent: InquiryIntent;
  try {
    intent = JSON.parse(intentJson);
  } catch {
    return { kind: "error", message: "Malformed intent payload." };
  }

  const ctx = await resolveSubmitContext(tenantSlug);
  if (!ctx.ok) return { kind: "error", message: ctx.error };

  // Drafts can only be saved by authenticated users for now. Guest drafts
  // (anonymous on /t/[profileCode]) submit immediately without a draft row —
  // the guest path skips autosave. The drawer surfaces this difference by
  // not mounting the autosave hook when actorUserId is null.
  if (!ctx.actorUserId) {
    return { kind: "error", message: "Sign in to save a draft." };
  }

  const result = await saveInquiryDraft(ctx.supabase, draftId, intent, {
    tenant_id: ctx.tenantId,
    requester_user_id: ctx.actorUserId,
    requester_email: ctx.actorEmail,
  });
  if (!result.ok) {
    logServerError("inquiry-intent-actions.saveDraft", new Error(result.error));
    return { kind: "error", message: "Could not save draft." };
  }

  // Touch the savedAt timestamp so the UI can show "Saved 12s ago".
  void prevState;
  return { kind: "saved", draftId: result.draftId, savedAt: new Date().toISOString() };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Submit a draft (load → validate → submit → redirect).
// ─────────────────────────────────────────────────────────────────────────────

export async function submitDraftAction(
  _prev: InquiryIntentActionState,
  formData: FormData,
): Promise<InquiryIntentActionState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  const draftId = String(formData.get("draftId") ?? "").trim();
  if (!tenantSlug) return { kind: "error", message: "Missing tenant slug." };
  if (!draftId) return { kind: "error", message: "Missing draft id." };

  const ctx = await resolveSubmitContext(tenantSlug);
  if (!ctx.ok) return { kind: "error", message: ctx.error };

  const result = await submitInquiryDraft(ctx.writeClient, draftId, {
    actor_user_id: ctx.actorUserId,
    client_user_id: ctx.actorUserId,
  });
  // Drafts are an authenticated-only feature, so this is never a guest.
  return finalizeSubmit(result, tenantSlug, { isGuest: false });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. One-shot submit — no draft persisted (fast path used by guests + the
//    review step when the user hits "Send" without ever saving a draft).
// ─────────────────────────────────────────────────────────────────────────────

export async function submitInquiryNowAction(
  _prev: InquiryIntentActionState,
  formData: FormData,
): Promise<InquiryIntentActionState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  if (!tenantSlug) return { kind: "error", message: "Missing tenant slug." };

  const intentJson = String(formData.get("intent") ?? "");
  let intent: InquiryIntent;
  try {
    intent = JSON.parse(intentJson);
  } catch {
    return { kind: "error", message: "Malformed intent payload." };
  }

  const ctx = await resolveSubmitContext(tenantSlug);
  if (!ctx.ok) return { kind: "error", message: ctx.error };

  // SECURITY (L1-F1): intent.talent.selected_ids is client-supplied and the
  // inquiry insert below runs under ctx.writeClient (the service-role client),
  // so we MUST verify every targeted talent is on THIS tenant's publicly visible
  // roster before creating the inquiry. Without this gate a crafted intent could
  // file an inquiry naming hidden / unapproved / off-roster / cross-agency
  // talent. Talent-less ("agency recommends") intents have no ids to gate.
  // Mirrors the legacy directory submitGuestInquiry / submitClientInquiry gate.
  const requestedTalentIds = intent.talent?.selected_ids ?? [];
  if (requestedTalentIds.length > 0) {
    const rosterCheck = await assertAllTalentOnTenantRoster(
      ctx.writeClient,
      ctx.tenantId,
      requestedTalentIds,
    );
    if (!rosterCheck.ok) {
      logServerError(
        "inquiry-intent-actions.submitInquiryNow/roster",
        new Error(`talent not on tenant roster: ${rosterCheck.missingIds.join(",")}`),
      );
      return {
        kind: "error",
        message: validationMessage(["brief.summary_or_talent"]),
        missingFields: ["talent.selected_ids"],
      };
    }
  }

  // For logged-in clients the intent.requester.user_id should be the
  // actor's user_id.
  if (ctx.actorUserId && !intent.requester.user_id) {
    intent.requester.user_id = ctx.actorUserId;
  }

  // Guest path — provision (or match) a client account by email so the
  // inquiry carries a real client participant and the visitor can claim
  // and track it later via a magic link. Mirrors the legacy directory
  // `submitGuestInquiry` flow so the canonical drawer is on parity.
  let clientUserId: string | null = ctx.actorUserId;
  let guestActivation: GuestActivationStatus | null = null;
  const guestEmail = intent.requester.email?.trim() ?? "";
  if (!ctx.actorUserId && guestEmail) {
    const provisioned = await ensureGuestClientByEmail({
      email: guestEmail,
      name: intent.requester.name?.trim() ?? "",
      company: intent.client?.company?.trim() ?? "",
      phone: intent.requester.phone?.trim() ?? "",
    });
    clientUserId = provisioned.clientUserId;
    guestActivation = provisioned.status;
  }

  const result = await createInquiryFromIntent(ctx.writeClient, intent, {
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.actorUserId,
    client_user_id: clientUserId,
    guest_session_id: ctx.guestSessionId,
  });

  // T4 — attachments NO LONGER ride this action's body.
  //
  // They used to arrive as `files[]` on this same FormData, which meant the
  // whole inquiry submit was subject to the ~4 MB Server Action body cap
  // (next.config.ts `serverActions.bodySizeLimit`) while the drawer
  // advertised 10 files x 20 MB. One phone photo and the SUBMIT failed —
  // not the attachment, the entire inquiry. And when a per-file upload did
  // fail server-side, the loop `continue`d, so the user was told the
  // inquiry sent and never learned their files were dropped.
  //
  // The drawer now submits the inquiry first (tiny body, always fits) and
  // then uploads each file through the signed pipeline below, reporting
  // per-file success/failure. See `createInquiryAttachmentUploadUrlAction`.

  return finalizeSubmit(result, tenantSlug, {
    isGuest: !ctx.actorUserId,
    guestActivation,
    guestEmail: guestEmail || null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 4. Inquiry attachments — signed pipeline (T4)
// ─────────────────────────────────────────────────────────────────────────────
//
// These live HERE rather than in `lib/server-actions/inquiry-attachment-signed.ts`
// on purpose. That module's `resolveScope` requires an AUTHENTICATED user
// (staff / inquiry client / talent participant). The inquiry drawer is
// mounted on public guest surfaces and its single most common caller has no
// user at all — the guest identity is the `x-impronta-guest` session that
// `resolveSubmitContext` above already resolves. Rather than teach the staff
// module about guests, the just-submitted-inquiry lane gets its own narrow
// pair, gated on "you are the party this inquiry was filed by".

const ATTACHMENT_BUCKET = "inquiry-files";
/** Matches the cap the drawer advertises (and now actually honours). */
const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_MAX_COUNT = 10;

/** Mirrors the drawer's `accept` list. Anything else is refused server-side. */
const ATTACHMENT_ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
]);

function isAllowedAttachmentMime(mime: string): boolean {
  const m = mime.toLowerCase();
  // SVG is excluded even though it is an image/* — inquiry-files is private
  // and served through signed URLs, but a signed URL still renders in the
  // browser, so an SVG there is the same stored-XSS shape as elsewhere.
  if (m === "image/svg+xml") return false;
  if (m.startsWith("image/")) return true;
  return ATTACHMENT_ALLOWED_MIME.has(m);
}

export type InquiryAttachmentActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Confirm the caller is the party that filed this inquiry — the signed-in
 * client on it, or the guest session it was created under. Everything else
 * (staff, talent, other clients) belongs to the staff module, not here.
 */
async function assertInquirySubmitter(
  ctx: Awaited<ReturnType<typeof resolveSubmitContext>> & { ok: true },
  inquiryId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!inquiryId) return { ok: false, error: "Missing inquiry." };
  const { data: inq } = await ctx.writeClient
    .from("inquiries")
    .select("id, tenant_id, client_user_id, guest_session_id")
    .eq("id", inquiryId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!inq) return { ok: false, error: "Inquiry not found." };

  const byUser =
    ctx.actorUserId != null &&
    (inq.client_user_id as string | null) === ctx.actorUserId;
  const byGuest =
    ctx.guestSessionId != null &&
    (inq.guest_session_id as string | null) === ctx.guestSessionId;
  if (!byUser && !byGuest) {
    return { ok: false, error: "Not authorized for this inquiry." };
  }
  return { ok: true };
}

/**
 * Step 1 — mint a one-shot signed upload URL into the private
 * `inquiry-files` bucket. Rejects on the DECLARED size/type before minting;
 * `registerInquiryAttachmentAction` re-checks the real stored bytes.
 */
export async function createInquiryAttachmentUploadUrlAction(input: {
  tenantSlug: string;
  inquiryId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
}): Promise<InquiryAttachmentActionResult<{ uploadUrl: string; storagePath: string }>> {
  const ctx = await resolveSubmitContext(input.tenantSlug);
  if (!ctx.ok) return { ok: false, error: "Could not resolve workspace." };

  const allowed = await assertInquirySubmitter(ctx, input.inquiryId);
  if (!allowed.ok) return allowed;

  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    return { ok: false, error: "File is empty." };
  }
  if (input.byteSize > ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: "File must be under 20 MB." };
  }
  if (!isAllowedAttachmentMime(input.mimeType || "")) {
    return { ok: false, error: "That file type isn't supported." };
  }

  // Refuse past the advertised count rather than letting an inquiry
  // accumulate unbounded objects one signed URL at a time.
  const { count } = await ctx.writeClient
    .from("inquiry_attachments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("inquiry_id", input.inquiryId);
  if ((count ?? 0) >= ATTACHMENT_MAX_COUNT) {
    return { ok: false, error: "This inquiry already has the maximum number of files." };
  }

  const objectId = crypto.randomUUID();
  const safeName = (input.filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const storagePath = `${ctx.tenantId}/${input.inquiryId}/${objectId}-${safeName}`;

  const { data, error } = await ctx.writeClient.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (error || !data) {
    logServerError("inquiry-intent-actions.attachment.signedUrl", error);
    return { ok: false, error: "Could not start upload. Try again." };
  }
  return {
    ok: true,
    data: { uploadUrl: data.signedUrl, storagePath: data.path ?? storagePath },
  };
}

/**
 * Step 2 — stat the stored object (server-verified size + mime, never the
 * client's claim) and write the `inquiry_attachments` row. On any refusal
 * the object is removed, so a rejected upload leaves nothing behind.
 */
export async function registerInquiryAttachmentAction(input: {
  tenantSlug: string;
  inquiryId: string;
  storagePath: string;
  filename: string;
}): Promise<InquiryAttachmentActionResult<{ filename: string }>> {
  const ctx = await resolveSubmitContext(input.tenantSlug);
  if (!ctx.ok) return { ok: false, error: "Could not resolve workspace." };

  const allowed = await assertInquirySubmitter(ctx, input.inquiryId);
  if (!allowed.ok) return allowed;

  const prefix = `${ctx.tenantId}/${input.inquiryId}/`;
  if (!input.storagePath.startsWith(prefix)) {
    return { ok: false, error: "Upload path doesn't match this inquiry." };
  }

  const slash = input.storagePath.lastIndexOf("/");
  const { data: listed, error: listErr } = await ctx.writeClient.storage
    .from(ATTACHMENT_BUCKET)
    .list(input.storagePath.slice(0, slash), {
      limit: 1,
      search: input.storagePath.slice(slash + 1),
    });
  const meta = (listed?.[0] as { metadata?: { size?: number; mimetype?: string } } | undefined)
    ?.metadata;
  if (listErr || !meta || typeof meta.size !== "number" || meta.size === 0) {
    logServerError("inquiry-intent-actions.attachment.stat", listErr);
    return { ok: false, error: "Could not verify the upload. Try again." };
  }

  const realMime = meta.mimetype || "application/octet-stream";
  if (meta.size > ATTACHMENT_MAX_BYTES || !isAllowedAttachmentMime(realMime)) {
    await ctx.writeClient.storage.from(ATTACHMENT_BUCKET).remove([input.storagePath]);
    return {
      ok: false,
      error:
        meta.size > ATTACHMENT_MAX_BYTES
          ? "File must be under 20 MB."
          : "That file type isn't supported.",
    };
  }

  const { error: insertErr } = await ctx.writeClient.from("inquiry_attachments").insert({
    tenant_id: ctx.tenantId,
    inquiry_id: input.inquiryId,
    storage_path: input.storagePath,
    filename: input.filename || "file",
    mime_type: realMime,
    byte_size: meta.size,
    attachment_kind: "moodboard",
    visibility: "agency_and_client",
  });
  if (insertErr) {
    // Compensate — an object with no row is invisible to every UI and to
    // the storage reaper's reference walk.
    await ctx.writeClient.storage.from(ATTACHMENT_BUCKET).remove([input.storagePath]);
    logServerError("inquiry-intent-actions.attachment.insert", new Error(insertErr.message));
    return { ok: false, error: "Could not attach the file. Try again." };
  }

  return { ok: true, data: { filename: input.filename || "file" } };
}

function finalizeSubmit(
  result: CreateInquiryFromIntentResult,
  tenantSlug: string,
  opts: {
    isGuest: boolean;
    guestActivation?: GuestActivationStatus | null;
    guestEmail?: string | null;
  },
): InquiryIntentActionState {
  if (!result.ok) {
    if (result.reason === "validation_failed") {
      return {
        kind: "error",
        message: validationMessage(result.missingFields ?? []),
        missingFields: result.missingFields,
      };
    }
    if (result.reason === "rate_limited") {
      return { kind: "error", message: "Too many inquiries — slow down a bit." };
    }
    if (result.reason === "forbidden") {
      return { kind: "error", message: "You don't have permission to do that." };
    }
    return { kind: "error", message: result.error ?? "Could not send inquiry." };
  }

  // Revalidate the surfaces that show inquiries.
  revalidatePath(`/${tenantSlug}/client/messages`);
  revalidatePath(`/${tenantSlug}/client/today`);
  revalidatePath(`/${tenantSlug}/client/inquiries`);

  // Per spec §15 the inquiry opens in the Messages shell — but the drawer
  // is also mounted on public guest surfaces (directory, /t/[code]) where
  // a server redirect into an authed route would bounce the visitor to
  // login. So we return a `submitted` state and let the drawer render an
  // in-place confirmation: authed clients get a "View in Messages" CTA,
  // guests get magic-link activation copy.
  return {
    kind: "submitted",
    inquiryId: result.inquiryId,
    tenantSlug,
    isGuest: opts.isGuest,
    guestActivation: opts.guestActivation ?? null,
    guestEmail: opts.guestEmail ?? null,
  };
}

function validationMessage(missing: string[]): string {
  if (missing.length === 0) return "Add the missing details and try again.";
  const friendly = missing
    .map((f) => {
      switch (f) {
        case "requester.name":
          return "your name";
        case "requester.email_or_phone":
          return "an email or phone";
        case "brief.summary_or_talent":
          return "a brief or a selected talent";
        case "location.city_or_status":
          return "a city or location status";
        case "date.event_date_or_status":
          return "a date or a date flexibility";
        default:
          return f;
      }
    })
    .join(", ");
  return `Add ${friendly} to continue.`;
}
