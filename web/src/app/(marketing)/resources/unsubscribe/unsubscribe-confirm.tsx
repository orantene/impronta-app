"use client";

import { useState, useTransition } from "react";
import { unsubscribeByToken } from "@/lib/marketing/subscribe/actions";

type Copy = {
  intro: string;
  cta: string;
  working: string;
  done: string;
  notFound: string;
};

/**
 * One-click-safe unsubscribe confirmation. The flip happens on a real button
 * click (a POST-shaped server-action call), never on GET page load, so an email
 * link-scanner or client prefetch cannot silently unsubscribe someone.
 */
export function UnsubscribeConfirm({ token, copy }: { token: string; copy: Copy }) {
  const [state, setState] = useState<"idle" | "done" | "not_found">("idle");
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (pending || state === "done") return;
    startTransition(async () => {
      const ok = await unsubscribeByToken(token);
      setState(ok ? "done" : "not_found");
    });
  }

  if (state === "done") {
    return (
      <p
        className="text-[0.9375rem] leading-[1.6]"
        style={{ color: "var(--plt-ink-strong)" }}
        role="status"
      >
        {copy.done}
      </p>
    );
  }

  if (state === "not_found") {
    return (
      <p className="text-[0.9375rem] leading-[1.6]" style={{ color: "var(--plt-muted)" }} role="alert">
        {copy.notFound}
      </p>
    );
  }

  return (
    <div>
      <p className="text-[0.9375rem] leading-[1.6]" style={{ color: "var(--plt-muted)" }}>
        {copy.intro}
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[0.9375rem] font-medium leading-none transition-[background,transform] duration-200 hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-70"
        style={{ background: "var(--plt-forest)", color: "var(--plt-on-inverse)" }}
      >
        {pending ? copy.working : copy.cta}
      </button>
    </div>
  );
}
