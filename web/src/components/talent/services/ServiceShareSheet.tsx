"use client";

/**
 * TUL-1270 #13: Share one service. A lasting link (id-based, survives renames:
 * see service-share-link.ts), a Copy button and a QR drawn client-side with the
 * repo's own encoder (lib/links/qr, no dependency). Loads the talent's
 * destinations itself so it works from the first row click.
 */
import { useEffect, useMemo, useState } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { encodeQr } from "@/lib/links/qr";
import { toSvg } from "@/lib/links/qr/render";
import { loadOfferingDestinations, type OfferingDestination } from "@/lib/talent/services-settings-actions";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { serviceShareUrl } from "@/lib/talent/service-share-link";

const COPY = {
  en: {
    title: "Share this service",
    sub: "This link keeps working if you rename the service.",
    copy: "Copy link",
    copied: "Link copied",
    qr: "Scan to open this service",
    loading: "Getting your link…",
    none: "Publish your profile first to get a link.",
    close: "Close",
  },
  es: {
    title: "Compartir este servicio",
    sub: "Este enlace sigue funcionando aunque cambies el nombre del servicio.",
    copy: "Copiar enlace",
    copied: "Enlace copiado",
    qr: "Escanea para abrir este servicio",
    loading: "Obteniendo tu enlace…",
    none: "Publica tu perfil primero para tener un enlace.",
    close: "Cerrar",
  },
} as const;

export function ServiceShareSheet({
  item,
  talentId,
  onClose,
}: {
  item: TalentOffering;
  talentId: string;
  onClose: () => void;
}) {
  const copy = useDashboardText();
  const t = copy.isSpanish ? COPY.es : COPY.en;
  const [destinations, setDestinations] = useState<OfferingDestination[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    void loadOfferingDestinations(talentId).then((res) => {
      if (live) setDestinations(res.ok ? res.destinations : []);
    });
    return () => {
      live = false;
    };
  }, [talentId]);

  const target = useMemo(
    () =>
      destinations
        ? serviceShareUrl({
            offering: { id: item.id, title: item.title, kind: item.kind, visibility: item.visibility },
            destinations,
            origin: typeof window === "undefined" ? "" : window.location.origin,
          })
        : null,
    [destinations, item.id, item.title, item.kind, item.visibility],
  );

  const qrSvg = useMemo(() => {
    if (!target) return null;
    try {
      return toSvg(encodeQr(target.url).matrix, { size: 168 });
    } catch {
      return null; // A URL too long for the encoder: the link and Copy still work.
    }
  }, [target]);

  const onCopy = async () => {
    if (!target || !navigator.clipboard) return;
    await navigator.clipboard.writeText(target.url);
    setCopied(true);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        className="w-full max-w-[420px] rounded-t-2xl bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 font-admin-body sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[18px] font-semibold text-admin-ink">{t.title}</h2>
        <p className="mt-0.5 text-[13px] text-admin-ink-dim">{item.title}</p>
        {destinations === null ? (
          <p className="mt-4 text-[13px] text-admin-ink-dim">{t.loading}</p>
        ) : !target ? (
          <p className="mt-4 text-[13px] text-admin-ink">{t.none}</p>
        ) : (
          <>
            <p className="mt-4 break-all rounded-lg border border-admin-border-soft bg-black/[0.02] px-3 py-2 text-[13px] text-admin-ink" data-service-share-url>
              {target.url}
            </p>
            <p className="mt-1.5 text-[12px] text-admin-ink-dim">{t.sub}</p>
            <button
              type="button"
              onClick={() => void onCopy()}
              className="mt-3 w-full rounded-lg bg-[var(--tc-action)] px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-[var(--tc-action-hover)]"
            >
              {copied ? t.copied : t.copy}
            </button>
            {qrSvg ? (
              <figure className="mt-4 flex flex-col items-center">
                {/* SVG built by our own encoder from rects only (no user markup). */}
                <div aria-label={t.qr} role="img" className="h-[168px] w-[168px]" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                <figcaption className="mt-1 text-[12px] text-admin-ink-dim">{t.qr}</figcaption>
              </figure>
            ) : null}
          </>
        )}
        <button type="button" onClick={onClose} className="mt-4 w-full rounded-lg border border-admin-border-soft px-4 py-2 text-[14px] font-semibold text-admin-ink">
          {t.close}
        </button>
      </div>
    </div>
  );
}
