"use client";

/**
 * Platform Admin — per-tenant commission override section.
 *
 * Shown inside the tenant management drawer + full page. Lets a platform
 * admin set/clear a per-tenant commission rate override and review any open
 * rate-change requests the workspace has submitted.
 */

import { useState, useTransition } from "react";
import { HQ, Chip } from "./hq-kit";
import {
  Accordion,
  Btn,
  ConfirmModal,
  Feedback,
  inputStyle,
  type SectionProps,
} from "./tenant-section-kit";
import {
  actionSetTenantCommissionOverride,
  actionClearTenantCommissionOverride,
  actionReviewCommissionRequest,
} from "./commission-actions";

function bpsToDisplay(bps: number | null): string {
  if (bps === null) return "—";
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

export function CommissionSection({ detail, onChanged, defaultOpen }: SectionProps) {
  const { commission } = detail;
  const { override, openRequest } = commission;

  const [takePct, setTakePct] = useState("");
  const [floorCents, setFloorCents] = useState("0");
  const [note, setNote] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [showForm, setShowForm] = useState(!override);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, successText: string) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ tone: "ok", text: successText });
        setReviewNote("");
        setNote("");
        await onChanged();
      } else {
        setMsg({ tone: "err", text: res.error ?? "Action failed." });
      }
    });
  }

  function handleSet() {
    const pct = parseFloat(takePct);
    if (!isFinite(pct) || pct < 0 || pct > 50) {
      setMsg({ tone: "err", text: "Take must be between 0% and 50%." });
      return;
    }
    const floor = parseFloat(floorCents);
    if (!isFinite(floor) || floor < 0) {
      setMsg({ tone: "err", text: "Floor must be 0 or positive cents." });
      return;
    }
    run(
      () =>
        actionSetTenantCommissionOverride({
          tenantId: detail.id,
          platformTakeBps: Math.round(pct * 100),
          platformTakeFloorCents: Math.round(floor),
          note: note.trim() || undefined,
        }),
      "Commission override saved.",
    );
  }

  return (
    <Accordion
      title="Commission override"
      trailing={
        override ? (
          <Chip bg={HQ.amberSoft} color={HQ.amber}>Override active</Chip>
        ) : openRequest ? (
          <Chip bg="rgba(155,168,183,0.15)" color={HQ.inkMuted}>Request pending</Chip>
        ) : null
      }
      defaultOpen={defaultOpen ?? Boolean(override || openRequest)}
    >
      <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Safety warning */}
        <div
          style={{
            background: "rgba(240,180,97,0.07)",
            border: "1px solid rgba(240,180,97,0.22)",
            borderRadius: 9,
            padding: "8px 10px",
            fontSize: 11.5,
            color: HQ.amber,
          }}
        >
          ⚠ Do not enable overrides for workspaces that receive cross-tenant inquiries
          until execution plan #2 ships.
        </div>

        {/* Active override card */}
        {override && (
          <div
            style={{
              background: HQ.amberSoft,
              border: "1px solid rgba(240,180,97,0.25)",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12.5, color: HQ.ink, fontWeight: 600 }}>
                {bpsToDisplay(override.platformTakeBps)} platform take
              </span>
              {override.platformTakeFloorCents != null && override.platformTakeFloorCents > 0 && (
                <Chip outline>floor ${(override.platformTakeFloorCents / 100).toFixed(2)}</Chip>
              )}
            </div>
            {override.overrideNote && (
              <div style={{ marginTop: 4, fontSize: 11.5, color: HQ.inkMuted }}>
                {override.overrideNote}
              </div>
            )}
            <div style={{ marginTop: 4, fontSize: 10.5, color: HQ.inkDim }}>
              Set {override.setAt ? new Date(override.setAt).toLocaleDateString() : "—"}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Btn tone="danger" onClick={() => setConfirmClear(true)} disabled={pending}>
                Clear override
              </Btn>
              <Btn onClick={() => setShowForm((v) => !v)} disabled={pending}>
                {showForm ? "Cancel" : "Replace"}
              </Btn>
            </div>
          </div>
        )}

        {/* Set / replace form */}
        {showForm && (
          <div
            style={{
              padding: "10px 12px",
              background: HQ.cardSofter,
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: HQ.inkDim }}>
              {override ? "Replace override" : "Set commission override"}
            </div>
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              Platform take (%)
              <input type="number" min={0} max={50} step={0.01} value={takePct} disabled={pending}
                placeholder="e.g. 5" onChange={(e) => setTakePct(e.target.value)}
                style={{ ...inputStyle, marginTop: 3 }} />
            </label>
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              Floor (cents, 0 = no floor)
              <input type="number" min={0} step={1} value={floorCents} disabled={pending}
                onChange={(e) => setFloorCents(e.target.value)}
                style={{ ...inputStyle, marginTop: 3 }} />
            </label>
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              Internal note (optional)
              <input type="text" value={note} disabled={pending}
                onChange={(e) => setNote(e.target.value)}
                style={{ ...inputStyle, marginTop: 3 }} />
            </label>
            <Btn tone="primary" onClick={handleSet} disabled={pending}>
              {pending ? "Saving…" : "Save override"}
            </Btn>
            <p style={{ fontSize: 10.5, color: HQ.inkDim, margin: 0 }}>
              Overrides the platform default and plan-tier rate for this workspace.
              Resolver precedence: tenant override &gt; plan tier &gt; platform default.
            </p>
          </div>
        )}

        {/* Open request review */}
        {openRequest && (
          <div
            style={{
              padding: "10px 12px",
              background: HQ.cardSofter,
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: HQ.amber }}>
              Open rate request
            </div>
            <div style={{ fontSize: 12.5, color: HQ.ink }}>
              Workspace is requesting{" "}
              <strong>{bpsToDisplay(openRequest.requestedPlatformTakeBps)}</strong>
            </div>
            {openRequest.requestedNote && (
              <div style={{ fontSize: 11.5, color: HQ.inkMuted }}>
                &ldquo;{openRequest.requestedNote}&rdquo;
              </div>
            )}
            {openRequest.requestedAt && (
              <div style={{ fontSize: 10.5, color: HQ.inkDim }}>
                Submitted {new Date(openRequest.requestedAt).toLocaleDateString()}
              </div>
            )}
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              Review note (optional)
              <input type="text" value={reviewNote} disabled={pending}
                placeholder="Reason for approval or denial"
                onChange={(e) => setReviewNote(e.target.value)}
                style={{ ...inputStyle, marginTop: 3 }} />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn tone="primary" disabled={pending}
                onClick={() => run(
                  () => actionReviewCommissionRequest({
                    tenantId: detail.id,
                    decision: "approve",
                    platformTakeBps: openRequest.requestedPlatformTakeBps ?? undefined,
                    reviewNote,
                  }),
                  "Request approved.",
                )}
              >
                Approve
              </Btn>
              <Btn tone="danger" disabled={pending}
                onClick={() => run(
                  () => actionReviewCommissionRequest({ tenantId: detail.id, decision: "deny", reviewNote }),
                  "Request denied.",
                )}
              >
                Deny
              </Btn>
            </div>
          </div>
        )}

        {!override && !openRequest && !showForm && (
          <div style={{ fontSize: 12.5, color: HQ.inkMuted }}>
            No override — using platform default or plan-tier rate.
            <div style={{ marginTop: 8 }}>
              <Btn onClick={() => setShowForm(true)}>Set override</Btn>
            </div>
          </div>
        )}

        <Feedback msg={msg} />
      </div>

      <ConfirmModal
        open={confirmClear}
        title="Clear commission override"
        body={
          <>
            Remove the custom commission rate for <strong>{detail.name}</strong>?
            They will return to the platform default or plan-tier rate.
          </>
        }
        confirmLabel="Clear override"
        pending={pending}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          run(() => actionClearTenantCommissionOverride({ tenantId: detail.id }), "Override cleared.");
        }}
      />
    </Accordion>
  );
}
