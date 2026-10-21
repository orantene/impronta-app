"use client";

/**
 * Friends collective settings card (TUL-1374): turn the model on, then set what
 * the owner takes from each member's price (a percent up to 90%, or a fixed
 * amount per sale). The server actions enforce owner-only and the 90% cap; the
 * bounds here only keep the form honest.
 */
import { useState, useTransition } from "react";
import { applyFriendsCollectivePreset, setMemberOwnerShare } from "@/lib/service-hub/friends-collective-actions";
import type { CollectiveCopy } from "@/lib/service-hub/friends-collective-copy";
import type { OwnerShare } from "@/lib/service-hub/friends-collective";

export type CollectiveReview = { id: string; rating: number; body: string };

export type CollectiveMember = { talentProfileId: string; name: string; share: OwnerShare | null; pending: OwnerShare | null };

type Mode = "none" | "percent" | "fixed";

function MemberRow({ member, locale, c }: { member: CollectiveMember; locale: "en" | "es"; c: CollectiveCopy }) {
  const [mode, setMode] = useState<Mode>(member.share?.kind ?? "none");
  const [percent, setPercent] = useState(member.share?.kind === "percent" ? String(member.share.bps / 100) : "");
  const [fixed, setFixed] = useState(member.share?.kind === "fixed" ? String(member.share.amountCents / 100) : "");
  const [currency, setCurrency] = useState(member.share?.kind === "fixed" ? member.share.currency : "MXN");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = () => {
    setMsg(null);
    let share: OwnerShare | null = null;
    if (mode === "percent") {
      const bps = Math.round(Number(percent) * 100);
      if (!Number.isFinite(bps) || bps < 0 || bps > 9000) return setMsg({ ok: false, text: c.overCap });
      share = { kind: "percent", bps };
    } else if (mode === "fixed") {
      const cents = Math.round(Number(fixed) * 100);
      if (!Number.isFinite(cents) || cents < 0) return setMsg({ ok: false, text: c.overCap });
      share = { kind: "fixed", amountCents: cents, currency: currency.trim().toUpperCase() };
    }
    start(async () => {
      const r = await setMemberOwnerShare({ talentProfileId: member.talentProfileId, share });
      if (r.ok) setMsg({ ok: true, text: share ? c.pendingNote : c.saved });
      else setMsg({ ok: false, text: r.reason === "owner_only" ? c.ownerOnly : r.reason === "invalid_share" ? c.overCap : "Could not save. Try again." });
    });
  };

  return (
    <div data-testid="collective-member-row" style={{ padding: "12px 0", borderBottom: "1px solid rgba(24,24,27,0.08)" }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{member.name}</div>
      {member.pending && <div role="note" style={{ fontSize: 12.5, opacity: 0.7, marginTop: 4 }}>{c.pendingNote}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 8 }}>
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} aria-label={c.memberHeading} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid rgba(24,24,27,0.15)" }}>
          <option value="none">{c.noShare}</option>
          <option value="percent">{c.percentLabel}</option>
          <option value="fixed">{c.fixedLabel}</option>
        </select>
        {mode === "percent" && (
          <input type="number" min={0} max={90} step={0.5} value={percent} onChange={(e) => setPercent(e.target.value)} aria-label={c.percentLabel} style={{ width: 90, padding: "7px 9px", borderRadius: 8, border: "1px solid rgba(24,24,27,0.15)" }} />
        )}
        {mode === "fixed" && (
          <>
            <input type="number" min={0} step={1} value={fixed} onChange={(e) => setFixed(e.target.value)} aria-label={c.fixedLabel} style={{ width: 110, padding: "7px 9px", borderRadius: 8, border: "1px solid rgba(24,24,27,0.15)" }} />
            <input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency" style={{ width: 64, padding: "7px 9px", borderRadius: 8, border: "1px solid rgba(24,24,27,0.15)", textTransform: "uppercase" }} />
          </>
        )}
        <button type="button" onClick={save} disabled={pending} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--color-admin-brand)", color: "#fff", fontWeight: 600, cursor: pending ? "default" : "pointer" }}>
          {c.save}
        </button>
        {msg && <span role="status" style={{ fontSize: 12.5, color: msg.ok ? "var(--color-admin-green)" : "var(--color-admin-red)" }}>{msg.text}</span>}
      </div>
    </div>
  );
}

/** `copy` is the active locale's table, resolved on the server, so only one language ships to the browser. */
export function CollectiveSharesCard({ locale, copy: c, isCollective, members, reviews, splitOn }: { locale: "en" | "es"; copy: CollectiveCopy; isCollective: boolean; members: CollectiveMember[]; reviews: CollectiveReview[]; splitOn: boolean }) {
  const [on, setOn] = useState(isCollective);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const apply = () =>
    start(async () => {
      const r = await applyFriendsCollectivePreset();
      if (r.ok) {
        setOn(true);
        setMsg(c.applied);
      } else {
        setMsg(r.reason === "owner_only" ? c.ownerOnly : r.message ?? "Could not turn this on. Try again.");
      }
    });

  return (
    <section>
      <h1 style={{ fontSize: 22, margin: "0 0 6px" }}>{c.title}</h1>
      <p style={{ margin: "0 0 12px", opacity: 0.7, lineHeight: 1.6 }}>{c.summary}</p>
      <ul style={{ margin: "0 0 16px", paddingLeft: 18, lineHeight: 1.7, fontSize: 13.5 }}>
        <li>{c.ownerShare}</li>
        <li>{c.capNote}</li>
        <li>{c.membersSee}</li>
        <li>{c.reviews}</li>
        <li>{c.seatCap}</li>
      </ul>
      {!on ? (
        <button type="button" onClick={apply} disabled={pending} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "var(--color-admin-brand)", color: "#fff", fontWeight: 600 }}>
          {c.apply}
        </button>
      ) : (
        <div>
          {!splitOn && <p role="note" style={{ fontSize: 13, opacity: 0.75 }}>{c.splitOff}</p>}
          <h2 style={{ fontSize: 15, margin: "8px 0 0" }}>{c.memberHeading}</h2>
          {members.map((m) => (
            <MemberRow key={m.talentProfileId} member={m} locale={locale} c={c} />
          ))}
          {reviews.length > 0 && (
            <div data-testid="collective-reviews" style={{ marginTop: 20 }}>
              <h2 style={{ fontSize: 15, margin: "0 0 6px" }}>{c.reviewsHeading}</h2>
              {reviews.map((r) => (
                <p key={r.id} style={{ margin: "6px 0", fontSize: 13.5 }}>
                  {"★".repeat(Math.max(0, Math.min(5, Math.round(r.rating))))} {r.body}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      {msg && <p role="status" style={{ marginTop: 10, fontSize: 13 }}>{msg}</p>}
    </section>
  );
}
