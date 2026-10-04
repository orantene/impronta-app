"use client";

/**
 * Wave 3 gallery chrome: quiet device + content toggles (ring/tick, not stacked
 * black blocks), one exit pattern (← / ✕), Unpublished only when dirty.
 */
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";
import type { MaisonPreviewContentMode } from "@/lib/talent-site/theme-catalog/maison/preview-hydration";
import type { MaisonPreviewDevice, MaisonStatusWord } from "./maison-choices";

const QUIET =
  "min-h-11 rounded-md px-3 text-[12.5px] font-semibold transition-colors";
const QUIET_ON = "bg-admin-surface-alt text-admin-ink ring-1 ring-admin-ink";
const QUIET_OFF = "text-admin-ink-muted hover:text-admin-ink";

export function DeviceToggle({
  locale,
  device,
  onChange,
}: {
  locale: MaisonSetupLocale;
  device: MaisonPreviewDevice;
  onChange: (d: MaisonPreviewDevice) => void;
}) {
  return (
    <div
      className="flex rounded-lg border border-admin-border-soft p-0.5"
      data-gallery-device-toggle=""
      role="group"
      aria-label={maisonSetupT(locale, "Desktop")}
    >
      {(["desktop", "phone"] as const).map((d) => (
        <button
          key={d}
          type="button"
          data-testid={`maison-device-${d}`}
          aria-pressed={device === d}
          aria-label={maisonSetupT(locale, d === "desktop" ? "Desktop" : "Phone")}
          onClick={() => onChange(d)}
          className={`${QUIET} ${device === d ? QUIET_ON : QUIET_OFF}`}
        >
          {d === "desktop" ? "🖥" : "📱"}
          {device === d ? <span className="ml-1" aria-hidden>✓</span> : null}
        </button>
      ))}
    </div>
  );
}

export function ContentModeToggle({
  locale,
  mode,
  onChange,
}: {
  locale: MaisonSetupLocale;
  mode: MaisonPreviewContentMode;
  onChange: (m: MaisonPreviewContentMode) => void;
}) {
  return (
    <div
      data-maison-content-mode=""
      className="grid grid-cols-2 rounded-lg border border-admin-border-soft p-0.5"
      role="tablist"
      aria-label={maisonSetupT(locale, "Show")}
    >
      {(["demo", "mine"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          data-testid={`maison-mode-${m}`}
          onClick={() => onChange(m)}
          className={`min-h-11 rounded-md text-[13px] font-semibold ${
            mode === m ? QUIET_ON : QUIET_OFF
          }`}
        >
          {maisonSetupT(locale, m === "demo" ? "Demo" : "See with my content")}
          {mode === m ? <span className="ml-1" aria-hidden>✓</span> : null}
        </button>
      ))}
    </div>
  );
}

export function DetailStatusWord({
  locale,
  status,
}: {
  locale: MaisonSetupLocale;
  status: MaisonStatusWord;
}) {
  // Wave 3: never show "Choices saved" / Elecciones guardadas. Only a quiet
  // Unpublished when there are unsaved choices; Live/Draft keep their words.
  if (status === "Choices saved") {
    return (
      <span
        data-maison-status=""
        data-testid="maison-status-word"
        className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-semibold text-admin-ink-dim"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-admin-ink-dim" aria-hidden />
        {maisonSetupT(locale, "Unpublished")}
      </span>
    );
  }
  if (status === "Preview") return null;
  return (
    <span
      data-maison-status=""
      data-testid="maison-status-word"
      className="shrink-0 text-[12.5px] font-semibold text-admin-ink-dim"
    >
      {maisonSetupT(locale, status)}
    </span>
  );
}

export function DetailDesktopHeader({
  locale,
  backLabel,
  fromLiveSite,
  designTitle,
  onBack,
  onClose,
  device,
  onDevice,
  status,
  liveStays,
}: {
  locale: MaisonSetupLocale;
  backLabel: string;
  fromLiveSite: boolean;
  designTitle: string;
  onBack: () => void;
  onClose: () => void;
  device: MaisonPreviewDevice;
  onDevice: (d: MaisonPreviewDevice) => void;
  status: MaisonStatusWord;
  liveStays: boolean;
}) {
  return (
    <header className="hidden items-center gap-3 border-b border-admin-border-soft px-4 py-3 md:flex md:min-h-16">
      <button
        type="button"
        onClick={onBack}
        className="grid h-11 w-11 place-items-center text-[18px] text-admin-ink"
        data-testid={fromLiveSite ? "maison-back-my-website" : "maison-back-designs"}
        aria-label={backLabel}
      >
        ←
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-admin-ink">{designTitle}</p>
      </div>
      {liveStays ? (
        <span
          data-testid="maison-live-stays-pill"
          className="inline max-w-[220px] shrink-0 text-[11.5px] text-admin-ink-dim"
        >
          {maisonSetupT(locale, "Your live site stays as it is until you publish.")}
        </span>
      ) : null}
      <DetailStatusWord locale={locale} status={status} />
      <DeviceToggle locale={locale} device={device} onChange={onDevice} />
      <button
        type="button"
        onClick={onClose}
        aria-label={maisonSetupT(locale, "Close")}
        className="grid h-11 w-11 place-items-center text-[18px] text-admin-ink"
      >
        ✕
      </button>
    </header>
  );
}

export function DetailPhoneHeader({
  locale,
  backLabel,
  fromLiveSite,
  designTitle,
  demoTitle,
  paletteName,
  onBack,
  onClose,
  status,
}: {
  locale: MaisonSetupLocale;
  backLabel: string;
  fromLiveSite: boolean;
  designTitle: string;
  demoTitle: string;
  paletteName: string;
  onBack: () => void;
  onClose: () => void;
  status: MaisonStatusWord;
}) {
  return (
    <header className="flex min-h-14 items-center gap-2 border-b border-admin-border-soft px-3 py-2 md:hidden">
      <button
        type="button"
        onClick={onBack}
        className="grid h-11 w-11 place-items-center text-[18px]"
        aria-label={backLabel}
        data-testid={fromLiveSite ? "maison-back-my-website" : "maison-back-designs"}
      >
        ←
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-admin-ink">{designTitle}</p>
        <p className="truncate text-[11.5px] text-admin-ink-muted">
          {demoTitle}
          {paletteName ? ` · ${paletteName}` : ""}
        </p>
      </div>
      <DetailStatusWord locale={locale} status={status} />
      <button
        type="button"
        onClick={onClose}
        aria-label={maisonSetupT(locale, "Close")}
        className="grid h-11 w-11 place-items-center text-[18px] text-admin-ink"
      >
        ✕
      </button>
    </header>
  );
}
