"use client";

import { useState, useTransition } from "react";

import { requestMatch } from "@/lib/match-me/match-me-actions";

export type MatchFormCopy = {
  describe: string;
  where: string;
  send: string;
  sending: string;
  sent: string; // contains {n}
  nobody: string;
  rateLimited: string;
  generic: string;
};

export function MatchRequestForm({ copy }: { copy: MatchFormCopy }) {
  const [description, setDescription] = useState("");
  const [zone, setZone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        start(async () => {
          const r = await requestMatch({ description, zone: zone.trim() || null });
          if (r.ok) {
            setMessage(copy.sent.replace("{n}", String(r.offered)));
            setDescription("");
            // Reload so the new request shows in the list below (server-rendered).
            window.setTimeout(() => window.location.reload(), 1200);
          } else {
            setMessage(r.reason === "nobody_matches" ? copy.nobody : r.reason === "rate_limited" ? copy.rateLimited : copy.generic);
          }
        });
      }}
      style={{ display: "grid", gap: 10, marginBottom: 24 }}
    >
      <label style={{ display: "grid", gap: 4, fontWeight: 600 }}>
        {copy.describe}
        <textarea required maxLength={2000} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} style={{ font: "inherit", padding: 10 }} />
      </label>
      <label style={{ display: "grid", gap: 4, fontWeight: 600 }}>
        {copy.where}
        <input maxLength={120} value={zone} onChange={(e) => setZone(e.target.value)} style={{ font: "inherit", padding: 10, minHeight: 44 }} />
      </label>
      <button type="submit" disabled={pending || description.trim().length === 0} style={{ minHeight: 44, padding: "0 18px", fontWeight: 600 }}>
        {pending ? copy.sending : copy.send}
      </button>
      {message ? <p role="status" style={{ margin: 0 }}>{message}</p> : null}
    </form>
  );
}
