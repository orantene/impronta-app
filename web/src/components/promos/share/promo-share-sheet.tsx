"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
    saveCopy: "Guardar imagen + copiar texto", copyLink: "Copiar enlace", copyCode: "Copiar código",
    qr: "Código QR", print: "Tarjeta para imprimir", close: "Cerrar", copied: "Copiado",
    saved: "Imagen guardada y texto copiado. Abre Instagram o TikTok y publícala.",
    failed: "No se pudo guardar. Intenta de nuevo.",
  },
  en: {
    title: "Share", lang: "Language", story: "Story", post: "Post",
    whatsapp: "WhatsApp", instagram: "Instagram", tiktok: "TikTok",
    saveCopy: "Save image + copy text", copyLink: "Copy link", copyCode: "Copy code",
    qr: "QR code", print: "Printable card", close: "Close", copied: "Copied",
    saved: "Image saved and text copied. Open Instagram or TikTok and post it.",
    failed: "Could not save. Please try again.",
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
    try {
      await navigator.clipboard.writeText(text);
      setNote(t.copied);
      logShare(promoId, via);
    } catch {
      setNote(t.failed);
    }
  };

  /** Instagram and TikTok have no posting API: share the file when the OS allows it, else download. */
  const saveAndCopy = async (asset: "story" | "post", via: ViaTag) => {
    const text = caption(via);
    try {
      await navigator.clipboard.writeText(text).catch(() => undefined);
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

  const btn = "inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2 text-sm font-medium";
  const channels = channelOrder(props.defaultLang);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${t.title} ${props.promoName}`}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 text-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t.title} &quot;{props.promoName}&quot;</h2>
          <button type="button" className={btn} onClick={onClose}>{t.close}</button>
        </div>

        <div className="mt-3 flex gap-2" role="group" aria-label={t.lang}>
          {(["es", "en"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
              className={`${btn} ${lang === l ? "border-2 font-semibold" : ""}`}>
              {l.toUpperCase()}
            </button>
          ))}
          <span className="mx-1" />
          {STYLES.filter((s) => s.key !== "photo" || props.photoUrl).map((s) => (
            <button key={s.key} type="button" aria-pressed={style === s.key} onClick={() => setStyle(s.key)}
              className={`${btn} ${style === s.key ? "border-2 font-semibold" : ""}`}>
              {s.label[lang]}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 items-start gap-3">
          {(["story", "post"] as const).map((a) => (
            <figure key={a} className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img(a)} alt={a === "story" ? t.story : t.post} className="w-full rounded-lg border" loading="lazy" />
              <figcaption className="mt-1 text-xs opacity-70">{a === "story" ? t.story : t.post}</figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {channels.map((c) =>
            c === "whatsapp" ? (
              <a key={c} className={btn} target="_blank" rel="noopener noreferrer"
                href={whatsappHref(caption("wa"))} onClick={() => logShare(promoId, "wa")}>
                {t.whatsapp}
              </a>
            ) : (
              <button key={c} type="button" className={btn}
                onClick={() => saveAndCopy(c === "instagram" ? "story" : "post", c === "instagram" ? "ig_story" : "tiktok")}>
                {c === "instagram" ? t.instagram : t.tiktok} · {t.saveCopy}
              </button>
            ),
          )}
          <button type="button" className={btn} onClick={() => saveAndCopy("post", "ig_post")}>{t.saveCopy}</button>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => copy(link("link"), "link")}>{t.copyLink}</button>
            {props.code ? (
              <button type="button" className={btn} onClick={() => copy(props.code ?? "", "code")}>{t.copyCode}</button>
            ) : null}
            <button type="button" className={btn} onClick={() => setQrOpen(true)}>{t.qr}</button>
            {props.printEnabled ? (
              <a className={btn} href={shareAssetUrl(promoId, "card", { lang, host: props.host, colors: props.colors })}
                target="_blank" rel="noopener noreferrer">
                {t.print}
              </a>
            ) : null}
          </div>
          <p role="status" aria-live="polite" className="min-h-5 text-sm opacity-80">{note}</p>
        </div>

        {qrOpen ? (
          <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-white p-6"
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
