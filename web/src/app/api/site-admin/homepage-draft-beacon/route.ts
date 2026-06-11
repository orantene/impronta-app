import { NextResponse } from "next/server";
import { z } from "zod";

import { requireStaffApi } from "@/lib/server/staff-api-route";
import { applyHomepageDraftBeaconAction } from "@/lib/site-admin/edit-mode/composition-actions";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

/**
 * Marathon W1-T5(c) — keepalive draft-flush endpoint.
 *
 * The in-place builder coalesces freeform edits into a debounced draft save
 * (~750ms). On pagehide the EditProvider used to fire the normal server action
 * (`saveDraftHomepageAction`) WITHOUT awaiting it — but a server action's
 * underlying fetch is NOT `keepalive`, so a hard tab-kill inside the debounce
 * window cancels the request mid-flight and the operator's last edits are lost.
 *
 * This route is a plain JSON POST the pagehide handler hits with
 * `fetch(..., { keepalive: true })` (or `navigator.sendBeacon`), which the
 * browser is required to complete even as the page unloads. It reuses the same
 * auth (requireStaffApi cookies) + capability/validation as the editor's draft
 * save, so it is a delivery-guaranteed wrapper, not a second save implementation.
 *
 * WS1-D — LAST-WRITE-WINS. The beacon carries the operator's per-tab
 * `editSessionId` + a monotonic `draftSeq`. `applyHomepageDraftBeaconAction`
 * compares them against the stamp on the stored draft and, for the operator's
 * OWN latest edit (same session + newer seq), bypasses the brittle version CAS
 * that used to 409-drop the last edit when a concurrent save bumped the version.
 * A different session, a stale seq, or an empty tree over good content is refused
 * (returns ok with no version change — nothing to retry). Cross-session /
 * co-editor conflicts still hard-fail.
 */
const bodySchema = z.object({
  locale: z.string().min(2).max(8),
  pageId: z.string().uuid().nullable().optional(),
  expectedVersion: z.number().int().min(0),
  metadata: z.record(z.string(), z.unknown()),
  slots: z.record(
    z.string(),
    z.array(
      z.object({
        sectionId: z.string(),
        sortOrder: z.number(),
      }),
    ),
  ),
  // The builder tree is validated server-side by the shared save path; accept
  // it opaquely here (same as the server action's `builderTree?: BuilderNodeTree`).
  builderTree: z.unknown().optional(),
  // WS1-D — per-tab edit-session token (uuid) + monotonic draft seq for LWW.
  editSessionId: z.string().uuid(),
  draftSeq: z.number().int().min(0),
});

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if ("error" in auth) return auth.error;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const result = await applyHomepageDraftBeaconAction({
      locale: parsed.data.locale,
      pageId: parsed.data.pageId ?? null,
      expectedVersion: parsed.data.expectedVersion,
      metadata:
        parsed.data.metadata as Parameters<
          typeof applyHomepageDraftBeaconAction
        >[0]["metadata"],
      slots: parsed.data.slots,
      builderTree: parsed.data.builderTree as Parameters<
        typeof applyHomepageDraftBeaconAction
      >[0]["builderTree"],
      editSession: {
        id: parsed.data.editSessionId,
        seq: parsed.data.draftSeq,
      },
    });
    if (!result.ok) {
      // A version conflict means another writer won — drop the beacon quietly.
      const status = result.code === "VERSION_CONFLICT" ? 409 : 400;
      return NextResponse.json(
        { ok: false, code: result.code, error: result.error },
        { status },
      );
    }
    return NextResponse.json({ ok: true, pageVersion: result.pageVersion });
  } catch (err) {
    logServerError("api/site-admin/homepage-draft-beacon", err);
    return NextResponse.json({ error: CLIENT_ERROR.generic }, { status: 500 });
  }
}
