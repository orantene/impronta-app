"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Callout } from "@/lib/promos/callouts/engine";
import { calloutText } from "@/lib/promos/callouts/copy";
import { resultsCopy, type Lang } from "@/lib/promos/results/copy";
import { markCalloutShown, respondToCallout } from "@/lib/promos/callouts/dismissals.actions";
import { useEffect } from "react";

/**
 * One smart callout (L5). The server picks it with `pickCallout` and passes it in;
 * this only renders and records the response. "Ahora no" snoozes 7 days,
 * "No mostrar de nuevo" hides the type.
 */
export function PromoCallout(props: { callout: Callout; lang: Lang; createHref: string }) {
  const [gone, setGone] = useState(false);
  const [, start] = useTransition();
  const text = calloutText(props.callout, props.lang);
  const c = resultsCopy(props.lang);

  useEffect(() => {
    void markCalloutShown();
  }, []);

  if (gone) return null;
  const respond = (action: "snooze" | "hide" | "accept") => {
    setGone(true);
    start(() => {
      void respondToCallout(props.callout.type, action);
    });
  };
  return (
    <aside className="rounded-2xl border border-[var(--tc-border,#e5e5ea)] bg-white p-4">
      <p className="text-sm text-[var(--tc-ink,#1c1c1e)]">{text.title}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href={props.createHref} onClick={() => respond("accept")} className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--tc-ink,#1c1c1e)] underline underline-offset-4">
          {text.cta}
        </Link>
        <button type="button" onClick={() => respond("snooze")} className="min-h-11 text-sm text-[var(--tc-muted,#6b6b73)]">{c.dismiss}</button>
        <button type="button" onClick={() => respond("hide")} className="min-h-11 text-sm text-[var(--tc-muted,#6b6b73)]">{c.hide}</button>
      </div>
    </aside>
  );
}
