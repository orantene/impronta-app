"use client";

/**
 * TUL-1463: "Leave a review" on a completed visit in `/account/visits/<id>`.
 * Five large star buttons (44px targets), an optional comment, one send button.
 * The server action re-checks everything (owner, tenant, completed, one per visit);
 * all copy arrives translated from the server page.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { interpolate } from "@/i18n/interpolate";
import { leaveVisitReview, type LeaveReviewRefusal } from "@/lib/client-account/visit-review-actions";

import { btnPrimary } from "./account-button-styles";

const INK = "var(--token-color-ink, #111)";
const LINE = "var(--token-color-line, rgba(0,0,0,.14))";
const RADIUS = "var(--site-radius-base, 8px)";

export type VisitReviewCopy = {
  title: string;
  rating: string;
  star: string;
  body: string;
  send: string;
  thanks: string;
  note: string;
  pickRating: string;
  errors: Partial<Record<LeaveReviewRefusal, string>> & { generic: string };
};

export function VisitReviewForm({ bookingId, copy }: { bookingId: string; copy: VisitReviewCopy }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) return <p role="status" style={{ margin: 0 }}>{copy.thanks}</p>;

  return (
    <form
      data-visit-review-form=""
      style={{ display: "grid", gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (rating < 1) {
          setMsg(copy.pickRating);
          return;
        }
        setMsg(null);
        start(async () => {
          const r = await leaveVisitReview({ bookingId, rating, body }).catch(() => null);
          if (r?.ok) {
            setDone(true);
            router.refresh();
          } else {
            setMsg((r && copy.errors[r.reason]) || copy.errors.generic);
          }
        });
      }}
    >
      <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
        <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{copy.rating}</legend>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={rating === n}
              aria-label={interpolate(copy.star, { n: String(n) })}
              onClick={() => setRating(n)}
              style={{
                width: 44, height: 44, borderRadius: RADIUS, border: `1px solid ${LINE}`, background: "transparent",
                color: INK, fontSize: 22, lineHeight: 1, cursor: "pointer",
              }}
            >
              <span aria-hidden>{n <= rating ? "★" : "☆"}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <label style={{ fontWeight: 600, fontSize: 14 }}>
        {copy.body}
        <textarea
          value={body}
          maxLength={4000}
          onChange={(e) => setBody(e.target.value)}
          style={{
            display: "block", marginTop: 6, width: "100%", minHeight: 88, boxSizing: "border-box", padding: 12, resize: "vertical",
            borderRadius: RADIUS, border: `1px solid ${LINE}`, background: "transparent", color: INK, font: "inherit",
          }}
        />
      </label>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>{copy.note}</p>
      <div><button type="submit" style={btnPrimary} disabled={pending}>{copy.send}</button></div>
      {msg ? <p role="status" style={{ margin: 0 }}>{msg}</p> : null}
    </form>
  );
}
