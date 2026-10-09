"use client";

/**
 * TUL-441 — shown on Website → Overview when starter content failed during
 * provision (non-fatal). One message + Reintentar that re-runs compose/seed
 * only. Independent of StarterDoor (zero-pages recipe path).
 */

import { useCallback, useEffect, useState, useTransition } from "react";

import { useT } from "@/i18n/use-t";
import {
  loadStarterPrepareStateAction,
  retryStarterPrepareAction,
} from "@/lib/server-actions/retry-starter-prepare";

export function StarterPrepareBanner() {
  const t = useT();
  const [needsRetry, setNeedsRetry] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await loadStarterPrepareStateAction();
        if (cancelled) return;
        setNeedsRetry(result.ok && result.needsRetry);
      } catch {
        if (!cancelled) setNeedsRetry(false);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const retry = useCallback(() => {
    setError(null);
    start(async () => {
      const result = await retryStarterPrepareAction();
      if (!result.ok) {
        setError(t("dashboard.adminWebsite.starterPrepareRetryFailed"));
        return;
      }
      window.location.reload();
    });
  }, [t]);

  if (!loaded || !needsRetry) return null;

  return (
    <section
      data-starter-prepare-failed=""
      data-testid="starter-prepare-failed"
      className="mb-4 rounded-[14px] border border-[rgba(24,24,27,0.14)] bg-white p-5"
      role="alert"
    >
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-stone-900">
        {t("dashboard.adminWebsite.starterPrepareFailedTitle")}
      </h2>
      <p className="mt-1 text-[13px] leading-snug text-stone-600">
        {t("dashboard.adminWebsite.starterPrepareFailedBody")}
      </p>
      {error ? (
        <p className="mt-2 text-[12.5px] text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={retry}
        disabled={pending}
        data-testid="starter-prepare-retry"
        className="mt-3 rounded-[10px] bg-stone-900 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
      >
        {pending
          ? t("dashboard.adminWebsite.starterPrepareRetryPending")
          : t("dashboard.adminWebsite.starterPrepareRetryCta")}
      </button>
    </section>
  );
}
