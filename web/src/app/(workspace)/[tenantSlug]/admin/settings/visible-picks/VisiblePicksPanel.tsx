"use client";

/**
 * TUL-1591 (e): "Who stays visible". One toggle per publicly shown member; the pick is the
 * roster's featured setting. The server action re-checks everything (role, active member,
 * already public, flag on); this screen only reflects it.
 */
import Link from "next/link";
import { useState, useTransition } from "react";

import { VISIBLE_PICKS_COPY, picksSummary } from "@/lib/service-hub/visible-picks";
import type { VisiblePicks } from "@/lib/service-hub/visible-picks.server";

import { setVisiblePick } from "./actions";

type Props = { locale: "en" | "es"; tenantSlug: string; picks: VisiblePicks | null };

function MemberRow({ locale, id, name, picked }: { locale: "en" | "es"; id: string; name: string; picked: boolean }) {
  const c = VISIBLE_PICKS_COPY[locale];
  const [on, setOn] = useState(picked);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const toggle = () => {
    const keep = !on;
    setMsg(null);
    start(async () => {
      const r = await setVisiblePick({ talentProfileId: id, keep });
      if (r.ok) {
        setOn(keep);
        setMsg({ ok: true, text: c.kept });
      } else {
        setMsg({ ok: false, text: r.reason === "not_public" ? c.notPublic : c.saveError });
      }
    });
  };
  return (
    <li data-testid="visible-pick-row" className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-admin-border)] py-3">
      <span className="text-sm font-semibold">{name || "·"}</span>
      <span className="flex items-center gap-3">
        {msg && (
          <span role="status" className={msg.ok ? "text-xs text-[var(--color-admin-green)]" : "text-xs text-[var(--color-admin-red)]"}>
            {msg.text}
          </span>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={on} disabled={pending} onChange={toggle} aria-label={`${c.keep}: ${name}`} />
          {c.keep}
        </label>
      </span>
    </li>
  );
}

export function VisiblePicksPanel({ locale, tenantSlug, picks }: Props) {
  const c = VISIBLE_PICKS_COPY[locale];
  const back = (
    <Link href={`/${tenantSlug}/admin/settings`} className="text-sm underline">
      {c.back}
    </Link>
  );
  if (!picks) {
    return (
      <section>
        {back}
        <h1 className="mt-4 text-xl font-semibold">{c.title}</h1>
        <p role="alert" className="mt-3 text-sm">{c.loadError}</p>
      </section>
    );
  }
  const pickedCount = picks.members.filter((m) => m.picked).length;
  const s = picksSummary({ cap: picks.cap, memberCount: picks.members.length, pickedCount });
  const status = s.unlimited ? c.unlimited : s.overCap ? c.overCap(s.hiddenCount, picks.cap ?? 0) : c.withinCap;
  return (
    <section>
      {back}
      <h1 className="mt-4 text-xl font-semibold">{c.title}</h1>
      <p className="mt-2 text-sm opacity-80">{c.intro}</p>
      <p data-testid="visible-picks-status" className="mt-4 text-sm font-medium">{status}</p>
      {s.tooManyPicks && picks.cap != null && <p role="note" className="mt-2 text-sm">{c.tooManyPicks(picks.cap)}</p>}
      {!s.unlimited && (
        picks.members.length === 0 ? (
          <p className="mt-4 text-sm">{c.empty}</p>
        ) : (
          <ul className="mt-4">
            {picks.members.map((m) => (
              <MemberRow key={m.talentProfileId} locale={locale} id={m.talentProfileId} name={m.name} picked={m.picked} />
            ))}
          </ul>
        )
      )}
    </section>
  );
}
