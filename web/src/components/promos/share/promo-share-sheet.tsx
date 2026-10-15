"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { UI } from "@/components/promos/talent/ui";
import { copyText } from "./copy-text";
import { PROMO_SHARE_LAYER, PROMO_SHARE_QR_LAYER } from "./layers";
import { encodeQr } from "@/lib/links/qr";
import { toSvg } from "@/lib/links/qr/render";
import type { ShareLang } from "@/lib/promos/share/captions";
import { buildPromoLink, whatsappHref, type ViaTag } from "@/lib/promos/share/links";
import { channelOrder, fillCaption, shareAssetUrl } from "@/lib/promos/share/sheet-model";
import type { ShareColors, ShareStyle } from "@/lib/promos/share/visual-model";

export type PromoShareSheetProps = {
  open: boolean;
  onClose: () => void;
  promoId: string;
  promoName: string;
  /** The promo's `link_slug`. */
  slug: string;
  /** Site origin the link lives on, e.g. https://ana.example.com. Hub sites pass the app origin plus `profileCode`. */
  origin: string;
  /** Set for hub links (`/t/<code>/p/<slug>`); omit on a talent host. */
  profileCode?: string | null;
  /** Registered host to brand the images and card with (talent custom domain). */
  host?: string | null;
  /** Site default language; the sheet toggles between ES and EN. */
  defaultLang: ShareLang;
  /** Captions with a `{link}` placeholder, from `captionTemplate()`, one per language. */
  captions: Record<ShareLang, string>;
  /** Secret code to offer "Copy code" for. */
  code?: string | null;
  /** Theme colours for the images. Defaults apply when missing. */
  colors?: Partial<ShareColors>;
  /** https photo on our storage host, enables the "photo" style. */
  photoUrl?: string | null;
  /** Printable card is paid-only: the caller passes the plan result. */
  printEnabled?: boolean;
};

const STYLES: { key: ShareStyle; label: Record<ShareLang, string> }[] = [
  { key: "theme", label: { es: "Tema", en: "Theme" } },
  { key: "bold", label: { es: "Destacado", en: "Bold" } },
  { key: "photo", label: { es: "Foto", en: "Photo" } },
];

const T = {
  es: {
    title: "Compartir", lang: "Idioma", story: "Historia", post: "Publicación",
    whatsapp: "WhatsApp", instagram: "Instagram", tiktok: "TikTok",
    saveCopy: "Guardar imagen + copiar texto", saveShort: "Guardar imagen", helper: "Guarda la imagen y copia el texto", style: "Estilo", format: "Formato", copyLink: "Copiar enlace", copyCode: "Copiar código",
    qr: "Código QR", print: "Tarjeta para imprimir", close: "Cerrar", copied: "Copiado",
    saved: "Imagen guardada y texto copiado. Abre Instagram o TikTok y publícala.",
    failed: "No se pudo guardar. Intenta de nuevo.",
    copyFailed: "No se pudo copiar, copia el enlace manualmente", linkLabel: "Enlace",
  },
  en: {
    title: "Share", lang: "Language", story: "Story", post: "Post",
    whatsapp: "WhatsApp", instagram: "Instagram", tiktok: "TikTok",
    saveCopy: "Save image + copy text", saveShort: "Save image", helper: "Saves the image and copies the text", style: "Style", format: "Format", copyLink: "Copy link", copyCode: "Copy code",
    qr: "QR code", print: "Printable card", close: "Close", copied: "Copied",
    saved: "Image saved and text copied. Open Instagram or TikTok and post it.",
    failed: "Could not save. Please try again.",
    copyFailed: "Could not copy, copy the link manually", linkLabel: "Link",
  },
} as const;

function logShare(promoId: string, via: ViaTag): void {
  void fetch("/api/promos/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ promoId, kind: "share", via }),
    keepalive: true,
  }).catch(() => undefined);
}

export function PromoShareSheet(props: PromoShareSheetProps) {
  const { open, onClose, promoId } = props;
  const [lang, setLang] = useState<ShareLang>(props.defaultLang);
  const [style, setStyle] = useState<ShareStyle>("theme");
  const [note, setNote] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const t = T[lang];

  const link = useCallback(
    (via: ViaTag) =>
      buildPromoLink({ origin: props.origin, slug: props.slug, profileCode: props.profileCode, via }),
    [props.origin, props.slug, props.profileCode],
  );
  const caption = useCallback((via: ViaTag) => fillCaption(props.captions[lang], link(via)), [props.captions, lang, link]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (qrOpen) setQrOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, qrOpen]);

  const img = useCallback(
    (asset: "story" | "post", download = false) =>
      shareAssetUrl(promoId, asset, {
        style, lang, host: props.host, colors: props.colors, photoUrl: props.photoUrl, download,
      }),
    [promoId, style, lang, props.host, props.colors, props.photoUrl],
  );

  const qrSvg = useMemo(() => {
    if (!qrOpen) return null;
    try {
      return toSvg(encodeQr(link("qr"), { ecc: "M" }).matrix, { dark: "#111111", light: "#ffffff" });
    } catch {
      return null;
    }
  }, [qrOpen, link]);

  if (!open) return null;

  const copy = async (text: string, via: ViaTag) => {
    const ok = await copyText(text);
    setNote(ok ? t.copied : t.copyFailed);
    if (ok) logShare(promoId, via);
  };

  /** Instagram and TikTok have no posting API: share the file when the OS allows it, else download. */
  const saveAndCopy = async (asset: "story" | "post", via: ViaTag) => {
    const text = caption(via);
    try {
      await copyText(text);
      const blob = await (await fetch(img(asset, true))).blob();
      const file = new File([blob], `promo-${asset}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      setNote(t.saved);
      logShare(promoId, via);
    } catch {
      setNote(t.failed);
    }
  };

  const btn = "inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--tc-border,#e5e5ea)] bg-white px-4 py-2 text-[14px] font-medium text-[var(--tc-ink,#1c1c1e)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tc-action,#0f766e)]";
  const on = "border-2 border-[var(--tc-action,#0f766e)] bg-[var(--tc-soft,#e6f4f1)] font-semibold";
  const shownLink = link("link");
  const channels = channelOrder(props.defaultLang);

  return (
    <div className={`fixed inset-0 ${PROMO_SHARE_LAYER} flex items-end justify-center bg-black/40`} role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${t.title} ${props.promoName}`}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[var(--tc-canvas,#fafafa)] p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] text-[var(--tc-ink,#1c1c1e)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className={UI.title}>{t.title}</h2>
            <p className={`truncate text-[13px] ${UI.muted}`}>{props.promoName}</p>
          </div>
          <button type="button" aria-label={t.close} className={`${UI.quiet} h-11 w-11 shrink-0 !px-0`} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.lang}>
            <span className={`w-16 shrink-0 text-[12px] ${UI.muted}`}>{t.lang}</span>
            {(["es", "en"] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
                className={`${btn} shrink-0 ${lang === l ? on : ""}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.style}>
            <span className={`w-16 shrink-0 text-[12px] ${UI.muted}`}>{t.style}</span>
            {STYLES.filter((s) => s.key !== "photo" || props.photoUrl).map((s) => (
              <button key={s.key} type="button" aria-pressed={style === s.key} onClick={() => setStyle(s.key)}
                className={`${btn} shrink-0 ${style === s.key ? on : ""}`}>
                {s.label[lang]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 items-start gap-3">
          {(["story", "post"] as const).map((a) => (
            <figure key={a} className={`${UI.card} m-0 flex flex-col gap-2 p-2`}>
              <figcaption className={`text-[12px] font-medium ${UI.muted}`}>{a === "story" ? t.story : t.post}</figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img(a)} alt={a === "story" ? t.story : t.post} className="w-full rounded-lg" loading="lazy" />
            </figure>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {channels.includes("whatsapp") ? (
            <a className={`${UI.primary} w-full`} target="_blank" rel="noopener noreferrer"
              href={whatsappHref(caption("wa"))} onClick={() => logShare(promoId, "wa")}>
              {t.whatsapp}
            </a>
          ) : null}
          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-3 gap-2">
              {channels.filter((c) => c !== "whatsapp").map((c) => (
                <button key={c} type="button" className={btn} aria-label={`${c === "instagram" ? t.instagram : t.tiktok} · ${t.saveCopy}`}
                  onClick={() => saveAndCopy(c === "instagram" ? "story" : "post", c === "instagram" ? "ig_story" : "tiktok")}>
                  {c === "instagram" ? t.instagram : t.tiktok}
                </button>
              ))}
              <button type="button" className={btn} aria-label={t.saveCopy} onClick={() => saveAndCopy("post", "ig_post")}>{t.saveShort}</button>
            </div>
            <p className={`text-[12px] ${UI.muted}`}>{t.helper}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={`${btn} px-2`} onClick={() => copy(link("link"), "link")}>{t.copyLink}</button>
            {props.code ? (
              <button type="button" className={`${btn} px-2`} onClick={() => copy(props.code ?? "", "code")}>{t.copyCode}</button>
            ) : null}
            <button type="button" className={`${btn} px-2`} onClick={() => setQrOpen(true)}>{t.qr}</button>
            {props.printEnabled ? (
              <a className={`${btn} px-2`} href={shareAssetUrl(promoId, "card", { lang, host: props.host, colors: props.colors })}
                target="_blank" rel="noopener noreferrer">
                {t.print}
              </a>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <input readOnly aria-label={t.linkLabel} value={shownLink} onFocus={(e) => e.currentTarget.select()}
              className="min-h-11 w-full rounded-xl border border-[var(--tc-border,#e5e5ea)] bg-white px-3 text-[16px] text-[var(--tc-ink,#1c1c1e)]" />
            <p role="status" aria-live="polite" className="min-h-5 text-sm text-[var(--tc-ink,#1c1c1e)]">{note}</p>
          </div>
        </div>

        {qrOpen ? (
          <div className={`fixed inset-0 ${PROMO_SHARE_QR_LAYER} flex flex-col items-center justify-center gap-4 bg-white p-6`}
            role="dialog" aria-modal="true" aria-label={t.qr}>
            {qrSvg ? (
              <div className="w-[min(80vw,80vh)]" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            ) : null}
            <button type="button" className={btn} onClick={() => setQrOpen(false)}>{t.close}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
