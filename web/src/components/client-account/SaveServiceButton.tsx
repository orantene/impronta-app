"use client";

/**
 * TUL-1463: heart / save button for ONE service (quick view, service page).
 *
 * Signed-in client: toggles the save (optimistic, reverted on failure).
 * Guest: nothing is written; a small prompt asks them to sign in. "Sign in" opens the
 * same client sign-in sheet the site header uses, right here on the page (email code,
 * Google and Apple run in a popup), so the visitor never leaves; once signed in the save
 * they asked for is finished and they are still on the same service.
 *
 * Status for every button on a page is read in ONE call (batched in a microtask).
 * Colours come from the site's token vars only.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { savedServiceStatus, setServiceSaved } from "@/lib/client-account/save-service-actions";
import { guestSaveOutcome } from "@/lib/client-account/save-service-ui";

import { ClientAccountButton } from "./ClientAccountButton";

const INK = "var(--token-color-ink, #111)";
const BG = "var(--token-color-surface-raised, var(--token-color-background, #fff))";
const LINE = "var(--token-color-line, rgba(0,0,0,.14))";
const ACCENT = "var(--token-color-primary, #111)";

type Status = { signedIn: boolean; saved: Set<string> };

let queued: Set<string> | null = null;
let pending: Promise<Status> | null = null;

/** One status read for every save button mounted in the same tick. */
function readStatus(offeringId: string): Promise<Status> {
  if (!queued) {
    queued = new Set();
    pending = new Promise<Status>((resolve) => {
      queueMicrotask(() => {
        const ids = [...(queued ?? [])];
        queued = null;
        pending = null;
        savedServiceStatus({ offeringIds: ids })
          .then((r) => resolve({ signedIn: r.signedIn, saved: new Set(r.saved) }))
          .catch(() => resolve({ signedIn: false, saved: new Set() }));
      });
    });
  }
  queued.add(offeringId.toLowerCase());
  return pending!;
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.2 3.6 5 6.9 5c2 0 3.4 1.1 4.1 2.4C11.7 6.1 13.1 5 15.1 5c3.3 0 5.4 3.2 4.2 6.3-1.8 4.6-7.3 9.2-7.3 9.2Z" />
    </svg>
  );
}

export function SaveServiceButton({ offeringId, title, locale, showLabel = false }: {
  offeringId: string;
  title: string;
  locale: string;
  /** Show "Save" / "Saved" next to the heart (service page); icon only in tight spots. */
  showLabel?: boolean;
}) {
  const loc = locale === "es" ? "es" : "en";
  const t = createTranslator(loc);
  const c = (k: string) => t(`public.saveService.${k}`);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void readStatus(offeringId).then((s) => {
      if (alive.current) setSaved(s.saved.has(offeringId.toLowerCase()));
    });
    return () => {
      alive.current = false;
    };
  }, [offeringId]);

  const save = useCallback(
    async (next: boolean) => {
      setBusy(true);
      setMsg(null);
      setSaved(next);
      const res = await setServiceSaved({ offeringId, saved: next }).catch(() => null);
      if (!alive.current) return;
      setBusy(false);
      const outcome = guestSaveOutcome(res);
      if (outcome === "ok") return;
      setSaved(!next);
      if (outcome === "sign_in") setPrompt(true);
      else setMsg(createTranslator(loc)(`public.saveService.${outcome === "clients_only" ? "clientsOnly" : "error"}`));
    },
    [offeringId, loc],
  );

  return (
    <span style={{ position: "relative", display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }} data-save-service={offeringId}>
      <button
        type="button"
        onClick={() => void save(!saved)}
        disabled={busy}
        aria-pressed={saved}
        aria-label={interpolate(c(saved ? "removeAria" : "saveAria"), { title })}
        data-saved={saved ? "true" : "false"}
        style={{
          minHeight: 44, minWidth: 44, padding: showLabel ? "0 14px" : 0, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
          borderRadius: 999, border: `1px solid ${LINE}`, background: "transparent", color: saved ? ACCENT : INK, font: "inherit", fontWeight: 600, cursor: "pointer",
        }}
      >
        <Heart filled={saved} />
        {showLabel ? <span>{c(saved ? "saved" : "save")}</span> : null}
      </button>
      {msg ? <span role="status" style={{ fontSize: 13 }}>{msg}</span> : null}
      {prompt ? (
        <span
          role="dialog"
          aria-label={c("promptTitle")}
          data-save-service-prompt=""
          style={{
            position: "absolute", top: "calc(100% + 6px)", insetInlineStart: 0, zIndex: 30, width: "min(300px, calc(100vw - 32px))", boxSizing: "border-box",
            display: "grid", gap: 10, padding: 16, borderRadius: 12, background: BG, color: INK, border: `1px solid ${LINE}`, boxShadow: "0 8px 28px rgba(0,0,0,.18)",
          }}
        >
          <strong>{c("promptTitle")}</strong>
          <span style={{ fontSize: 14 }}>{c("promptBody")}</span>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => { setPrompt(false); setSigningIn(true); }}
              style={{ minHeight: 44, padding: "0 16px", borderRadius: 999, border: 0, background: ACCENT, color: "var(--token-color-on-primary, #fff)", font: "inherit", fontWeight: 600, cursor: "pointer" }}
            >
              {c("signIn")}
            </button>
            <button
              type="button"
              onClick={() => setPrompt(false)}
              style={{ minHeight: 44, padding: "0 16px", borderRadius: 999, border: `1px solid ${LINE}`, background: "transparent", color: INK, font: "inherit", fontWeight: 600, cursor: "pointer" }}
            >
              {c("notNow")}
            </button>
          </span>
        </span>
      ) : null}
      {signingIn ? (
        <ClientAccountButton
          variant="header"
          locale={loc}
          hideTrigger
          defaultOpen
          onSignedIn={() => void save(true)}
          onClose={() => setSigningIn(false)}
        />
      ) : null}
    </span>
  );
}
