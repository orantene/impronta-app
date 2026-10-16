"use client";

/**
 * TUL-1000: HQ console route-segment error boundary. A client render error in
 * a heavy tab (Builder Lab mounts a large client shell) used to bubble to the
 * global error page; here the topbar stays, so the operator can retry or move
 * to another tab.
 */
import { useEffect } from "react";
import { logServerError } from "@/lib/server/safe-error";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";

export default function PlatformAdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const es = String(useDashboardLocale()).toLowerCase().startsWith("es");
  useEffect(() => {
    logServerError("platform/admin/error.tsx", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto mt-12 max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-8"
    >
      <h1 className="text-xl font-semibold text-white">
        {es ? "Esta pantalla no pudo cargar" : "This screen could not load"}
      </h1>
      <p className="mt-2 text-sm text-white/70">
        {es
          ? "Inténtalo de nuevo, o abre otra pestaña del menú superior."
          : "Try again, or open another tab from the top menu."}
      </p>
      {error?.digest ? (
        <p className="mt-2 font-mono text-[11px] text-white/40">Ref: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="mt-5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
      >
        {es ? "Reintentar" : "Try again"}
      </button>
    </div>
  );
}
