// Workspace auto-acknowledgement settings.
//
// Step 13 of the inquiry-funnel plan defines an auto-ack message that
// posts into the Client thread on every new inquiry. The engine + DB +
// migration are already shipped; this page is the missing config UI so
// the workspace can edit their message / toggle it off without us
// touching the mega Settings shell.
//
// URL-only for now (orphan route). Link to it from email footers, the
// Onboarding checklist, or paste directly. Promotion to the admin
// Settings nav comes with the mega-shell extraction.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { updateAutoAckPolicy } from "./actions";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;
type SearchParams = Promise<{ ok?: string; err?: string }>;

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  success:    "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(138,111,26,0.10)",
} as const;

const FALLBACK_MESSAGE = "Thanks — we'll get back to you within 4 hours.";

export default async function AutoAckPolicyPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { tenantSlug } = await params;
  const { ok, err } = await searchParams;

  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const role = scope.membership.role;
  const canEdit = role === "owner" || role === "admin";

  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();

  const { data: agencyRow, error: loadErr } = await supabase
    .from("agencies")
    .select("auto_ack_enabled, auto_ack_message")
    .eq("id", scope.tenantId)
    .maybeSingle();
  if (loadErr) logServerError("admin.policy.autoAck.load", loadErr);

  const enabled =
    typeof agencyRow?.auto_ack_enabled === "boolean"
      ? agencyRow.auto_ack_enabled
      : true;
  const message =
    typeof agencyRow?.auto_ack_message === "string" &&
    agencyRow.auto_ack_message.trim()
      ? agencyRow.auto_ack_message
      : FALLBACK_MESSAGE;

  return (
    <div style={{ fontFamily: FONT, padding: "24px 28px", maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
          textTransform: "uppercase", color: C.inkMuted, marginBottom: 6,
        }}>
          Admin · Workspace policy
        </div>
        <h1 style={{
          fontSize: 26, fontWeight: 700, color: C.ink,
          margin: 0, marginBottom: 6, letterSpacing: -0.4,
        }}>
          Auto-acknowledgement
        </h1>
        <p style={{
          fontSize: 13, color: C.inkMuted, margin: 0, lineHeight: 1.55,
          maxWidth: 580,
        }}>
          When a new inquiry lands, post this message into the client&apos;s
          private thread automatically. Gives them an instant signal that
          you&apos;ve received it, while your coordinator picks it up.
        </p>
      </div>

      {ok ? (
        <div style={{
          padding: "10px 12px", marginBottom: 16,
          background: C.successSoft, color: C.success,
          borderRadius: 10, fontSize: 12.5, fontWeight: 600,
        }}>
          ✓ Saved.
        </div>
      ) : null}
      {err ? (
        <div style={{
          padding: "10px 12px", marginBottom: 16,
          background: C.amberSoft, color: C.amber,
          borderRadius: 10, fontSize: 12.5, fontWeight: 600,
        }}>
          {err}
        </div>
      ) : null}

      <form
        action={updateAutoAckPolicy}
        style={{
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <input type="hidden" name="tenantSlug" value={tenantSlug} />

        <label style={{ display: "flex", gap: 10, cursor: canEdit ? "pointer" : "not-allowed", alignItems: "flex-start" }}>
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={enabled}
            disabled={!canEdit}
            style={{ marginTop: 3, width: 16, height: 16, accentColor: C.accent }}
          />
          <span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
              Auto-acknowledge new inquiries
            </span>
            <span style={{ display: "block", fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
              When off, no message is posted automatically and the client sees
              an empty thread until your team replies.
            </span>
          </span>
        </label>

        <div>
          <label htmlFor="auto-ack-message" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkMuted, marginBottom: 6 }}>
            Message text
          </label>
          <textarea
            id="auto-ack-message"
            name="message"
            defaultValue={message}
            disabled={!canEdit}
            rows={3}
            maxLength={500}
            placeholder={FALLBACK_MESSAGE}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              fontSize: 13.5,
              fontFamily: FONT,
              color: C.ink,
              lineHeight: 1.5,
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          <div style={{ fontSize: 11.5, color: C.inkDim, marginTop: 4 }}>
            Plain text only. 500 characters max. Empty = the default message.
          </div>
        </div>

        {!canEdit && (
          <div style={{
            padding: "8px 10px",
            background: C.surface,
            borderRadius: 8,
            fontSize: 12, color: C.inkMuted,
            border: `1px dashed ${C.borderSoft}`,
          }}>
            Only owners and admins can change this setting. Your role is <b>{role}</b>.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="submit"
            disabled={!canEdit}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 36,
              padding: "0 16px",
              borderRadius: 9,
              background: canEdit ? C.accent : "rgba(11,11,13,0.10)",
              color: canEdit ? "#fff" : C.inkDim,
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              cursor: canEdit ? "pointer" : "not-allowed",
              letterSpacing: -0.1,
            }}
          >
            Save
          </button>
        </div>
      </form>

      <div style={{
        marginTop: 24,
        padding: 16,
        background: C.surface,
        borderRadius: 12,
        border: `1px solid ${C.borderSoft}`,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: C.inkDim, marginBottom: 10 }}>
          What the client sees
        </div>
        {enabled ? (
          <div style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            maxWidth: 480,
          }}>
            <div style={{
              flexShrink: 0,
              width: 28, height: 28, borderRadius: "50%",
              background: C.accent,
              color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
            }}>
              ✶
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: C.inkMuted, marginBottom: 4,
              }}>
                Workspace · just now
              </div>
              <div style={{
                background: C.cardBg,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                borderTopLeftRadius: 4,
                padding: "10px 12px",
                fontSize: 13.5,
                color: C.ink,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {message}
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            fontSize: 12.5, color: C.inkMuted, fontStyle: "italic",
          }}>
            Nothing — auto-acknowledgement is off. The client&apos;s thread
            stays empty until your team replies.
          </div>
        )}
      </div>
    </div>
  );
}
