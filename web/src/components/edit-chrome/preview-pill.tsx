"use client";

/**
 * Phase 9 v2 — staff `?preview=1` floating-pill chrome.
 *
 * Pairs with the share-link half of Phase 9. When a logged-in staff
 * operator with the edit cookie set lands on a tenant page with the
 * `?preview=1` query parameter, EditChrome routes here instead of
 * mounting the full editor shell. The result is a clean, visitor-style
 * view of the live storefront (no top bar, no inspector dock, no
 * navigator, no overlays — public header / footer / search bar all show
 * through normally) with one floating pill at the bottom-right that
 * carries:
 *
 *   1. Device switcher (Desktop / Tablet / Mobile) — reuses the same
 *      max-width clamp the editor canvas applies (834 / 390 / unbounded)
 *      so a designer can sanity-check breakpoints without leaving the
 *      session. Default Desktop on every page load.
 *   2. Share icon — opens an inline popover identical in shape to the
 *      topbar's: optional human label + TTL choice (1h / 24h / 7d / 30d),
 *      "Generate link" CTA. Mints via `createShareLinkAction`, copies
 *      the absolute URL to the clipboard, flashes a green checkmark,
 *      and on clipboard-permission failure falls back to a `prompt`.
 *   3. "Back to edit" link — strips `?preview=1` from the current URL
 *      and reloads, returning the operator to the full shell.
 *
 * Why a separate pill rather than reusing the EditPill (idle state):
 *   The EditPill represents "edit cookie OFF" and surfaces a single
 *   "Edit" button to engage edit mode. The PreviewPill represents
 *   "edit cookie ON, but the operator wants a clean view temporarily"
 *   and surfaces the inverse CTA. Distinct components keep each
 *   pill's state model trivial.
 *
 * Why hide every other chrome surface: preview mode is a deliberate
 * "what does my visitor see" view. Keeping the inspector / drawers /
 * navigator visible would defeat the purpose. The pill's overlay
 * `<style>` block resets the body padding the shell normally reserves
 * (54px top, 280/22px left, 380/0px right) and unhides the public
 * header that the shell suppresses via SSR style.
 *
 * Forward compatibility: the pill is the staff-side analogue of the
 * `/share/<token>` viewer chrome that Phase 9 v1 already shipped — both
 * surface a "from {tenant} · expires {date}" banner / pill metadata so
 * a recipient on either side knows what they're looking at. When the
 * comment-mode toggle lands in Phase 11, the same pill grows a fourth
 * affordance instead of needing a new chrome surface.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createShareLinkAction } from "@/lib/site-admin/share-link/share-actions";
import { CHROME, CHROME_RADII, CHROME_SHADOWS } from "./kit";

type PreviewDevice = "desktop" | "tablet" | "mobile";
const PREVIEW_DEVICE_WIDTHS: Record<PreviewDevice, number | null> = {
  desktop: null,
  tablet: 834,
  mobile: 390,
};

const SHARE_TTL_CHOICES = [
  { id: "1h", label: "1 hour", seconds: 60 * 60 },
  { id: "24h", label: "24 hours", seconds: 24 * 60 * 60 },
  { id: "7d", label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { id: "30d", label: "30 days", seconds: 30 * 24 * 60 * 60 },
] as const;
const SHARE_TTL_DEFAULT = "7d" as const;

export function PreviewPill() {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [shareOpen, setShareOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-clear the inline error after a few seconds so it doesn't squat
  // the pill — same rhythm the shell's mutation toast uses.
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 4500);
    return () => window.clearTimeout(t);
  }, [error]);

  return (
    <>
      <PreviewChromeReset />
      <PreviewDeviceFrameStyle device={device} />
      {/* T2-3 — Slim top banner that makes preview mode unmistakable.
          Audit said "Preview as visitor kept me in essentially the
          same shell context" — the bottom-right pill alone wasn't a
          strong enough signal that the operator was in a different
          mode. The banner pins to the top, uses a distinct accent
          color (zinc-900 with a soft amber dot), and gives a one-line
          recovery affordance. The body's existing padding-top:0 reset
          means the public header still renders below this banner
          without overlap. */}
      <PreviewBanner />
      <div
        data-edit-preview-pill
        className="fixed bottom-[24px] right-[24px] z-[200] flex items-center gap-1 px-1.5 py-1.5"
        style={{
          background: CHROME.paper,
          borderRadius: CHROME_RADII.lg,
          border: `1px solid ${CHROME.lineMid}`,
          boxShadow: CHROME_SHADOWS.popover,
        }}
      >
        <DeviceCluster device={device} setDevice={setDevice} />
        <span
          aria-hidden
          style={{
            width: 1,
            height: 22,
            background: CHROME.line,
            margin: "0 4px",
          }}
        />
        <ShareButton
          open={shareOpen}
          setOpen={setShareOpen}
          onError={setError}
        />
        <BackToEditButton />
      </div>
      {error ? <ErrorToast message={error} onDismiss={() => setError(null)} /> : null}
    </>
  );
}

/**
 * Top-pinned banner shown the entire time preview mode is engaged.
 * Single 28px strip, dark background so it reads as scaffolding rather
 * than storefront UI. Includes a "Back to editing" affordance for
 * operators who scroll past the bottom-right pill or use a small
 * window where the pill might be obscured.
 */
function PreviewBanner() {
  const router = useRouter();
  const params = useSearchParams();
  const handleBack = () => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("preview");
    router.replace(`${url.pathname}${url.search}${url.hash}`);
  };
  // Touch the params subscription so this banner reacts to URL flips
  // even if the parent component memoizes its render. (Reading any
  // value ties the banner to the search-params re-render cycle.)
  void params;
  return (
    <div
      data-edit-preview-banner
      className="pointer-events-auto fixed inset-x-0 top-0 z-[195] flex items-center justify-center gap-3 px-4"
      style={{
        height: 28,
        background: CHROME.chipInk,
        color: "rgba(255, 255, 255, 0.86)",
        fontSize: 11.5,
        fontWeight: 500,
        letterSpacing: "-0.005em",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: 999,
          background: CHROME.amber,
          boxShadow: "0 0 0 3px rgba(180, 83, 9, 0.18)",
        }}
      />
      <span>Previewing as visitor</span>
      <span aria-hidden style={{ opacity: 0.4 }}>·</span>
      <button
        type="button"
        onClick={handleBack}
        className="cursor-pointer underline-offset-4 transition hover:underline"
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255, 255, 255, 0.86)",
          fontSize: 11.5,
          fontWeight: 600,
          padding: 0,
        }}
      >
        Back to editing
      </button>
    </div>
  );
}

// ── chrome reset ───────────────────────────────────────────────────────────

/**
 * Inverts the SSR `<style>` block that EditChrome applies in shell mode:
 * removes the topbar reservation (54px), removes the navigator + dock
 * gutters (left 280/22, right 380/0), and re-shows the public header
 * + footer that shell mode hides. Self-contained so the pill can be
 * mounted without coordinating with the shell controller.
 */
function PreviewChromeReset() {
  return (
    <style>{`
      /* T2-3 — body reserves 28px for the top "Previewing as visitor"
         banner so the public header doesn't slide underneath it. */
      body { padding-top: 28px !important; }
      header[data-public-header] { display: revert !important; }
      @media (min-width: 1024px) {
        body { padding-left: 0 !important; padding-right: 0 !important; }
      }
    `}</style>
  );
}

function PreviewDeviceFrameStyle({ device }: { device: PreviewDevice }) {
  const width = PREVIEW_DEVICE_WIDTHS[device];
  if (!width) return null;
  return (
    <style>{`
      body {
        max-width: ${width}px !important;
        margin-left: auto !important;
        margin-right: auto !important;
        border-radius: 18px !important;
        overflow-x: hidden !important;
        box-shadow:
          0 0 0 1px rgba(0, 0, 0, 0.08),
          0 30px 80px -30px rgba(0, 0, 0, 0.28),
          0 8px 24px -12px rgba(0, 0, 0, 0.12) !important;
      }
    `}</style>
  );
}

// ── device switcher ────────────────────────────────────────────────────────

function DeviceCluster({
  device,
  setDevice,
}: {
  device: PreviewDevice;
  setDevice: (d: PreviewDevice) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Preview viewport"
      style={{ display: "inline-flex", gap: 2 }}
    >
      <DeviceButton
        active={device === "desktop"}
        onClick={() => setDevice("desktop")}
        label="Desktop"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="2" y="4" width="20" height="14" rx="2" />
          <line x1="8" y1="22" x2="16" y2="22" />
          <line x1="12" y1="18" x2="12" y2="22" />
        </svg>
      </DeviceButton>
      <DeviceButton
        active={device === "tablet"}
        onClick={() => setDevice("tablet")}
        label="Tablet"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="12" y1="18" x2="12" y2="18" />
        </svg>
      </DeviceButton>
      <DeviceButton
        active={device === "mobile"}
        onClick={() => setDevice("mobile")}
        label="Mobile"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <line x1="12" y1="18" x2="12" y2="18" />
        </svg>
      </DeviceButton>
    </div>
  );
}

function DeviceButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="cursor-pointer transition"
      style={{
        width: 30,
        height: 28,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? CHROME.accent : "transparent",
        color: active ? "#fff" : CHROME.text,
        border: 0,
        borderRadius: 6,
      }}
    >
      {children}
    </button>
  );
}

// ── share button ───────────────────────────────────────────────────────────

function ShareButton({
  open,
  setOpen,
  onError,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  onError: (msg: string | null) => void;
}) {
  const [label, setLabel] = useState("");
  const [ttlChoice, setTtlChoice] =
    useState<(typeof SHARE_TTL_CHOICES)[number]["id"]>(SHARE_TTL_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-preview-share]")) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      setLabel("");
      setTtlChoice(SHARE_TTL_DEFAULT);
    }
  }, [open]);

  async function handleGenerate() {
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      const ttlSeconds = SHARE_TTL_CHOICES.find((c) => c.id === ttlChoice)
        ?.seconds;
      const ttlHours =
        typeof ttlSeconds === "number" ? ttlSeconds / 3600 : undefined;
      const res = await createShareLinkAction({
        label: label.trim() || undefined,
        ttlHours,
      });
      if (!res.ok) {
        onError(res.error);
        return;
      }
      const url = `${window.location.origin}${res.path}`;
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setOpen(false);
          window.setTimeout(() => setCopied(false), 2200);
        } catch {
          window.prompt("Share link", url);
        }
      } else {
        window.prompt("Share link", url);
      }
    } catch (err) {
      onError(
        err instanceof Error ? err.message : "Failed to create share link.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative" data-preview-share>
      <button
        type="button"
        title={copied ? "Link copied" : "Share preview link"}
        onClick={() => setOpen(!open)}
        className="cursor-pointer transition"
        style={{
          width: 32,
          height: 28,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          color: copied ? CHROME.green : CHROME.text,
          border: 0,
          borderRadius: 6,
        }}
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
            <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
          </svg>
        )}
      </button>

      {open ? (
        <div
          className="absolute right-0 bottom-[40px] w-[300px] rounded-[10px] p-[14px]"
          style={{
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            boxShadow: CHROME_SHADOWS.popover,
          }}
        >
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: CHROME.ink,
              letterSpacing: "-0.005em",
            }}
          >
            Share a preview link
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: CHROME.muted,
              marginTop: 2,
              lineHeight: 1.45,
            }}
          >
            Anyone with the link can view this draft until it expires.
          </div>

          <label
            style={{
              display: "block",
              marginTop: 12,
              fontSize: 11,
              fontWeight: 600,
              color: CHROME.text,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
          >
            Label{" "}
            <span style={{ fontWeight: 500, color: CHROME.muted, textTransform: "none", letterSpacing: 0 }}>
              (optional)
            </span>
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Q3 review draft"
            maxLength={80}
            spellCheck={false}
            style={{
              width: "100%",
              marginTop: 4,
              padding: "7px 9px",
              fontSize: 12.5,
              color: CHROME.ink,
              background: CHROME.paper,
              border: `1px solid ${CHROME.line}`,
              borderRadius: 6,
              outline: 0,
              boxSizing: "border-box",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleGenerate();
              }
            }}
          />

          <div
            style={{
              marginTop: 12,
              fontSize: 11,
              fontWeight: 600,
              color: CHROME.text,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
          >
            Expires in
          </div>
          <div
            role="radiogroup"
            aria-label="Link expiration"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: 4,
              marginTop: 4,
            }}
          >
            {SHARE_TTL_CHOICES.map((c) => {
              const active = c.id === ttlChoice;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTtlChoice(c.id)}
                  className="cursor-pointer transition"
                  style={{
                    padding: "6px 0",
                    fontSize: 11.5,
                    fontWeight: 500,
                    background: active ? CHROME.accent : CHROME.paper,
                    color: active ? "#fff" : CHROME.text,
                    border: `1px solid ${active ? CHROME.accent : CHROME.line}`,
                    borderRadius: 6,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 6,
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="cursor-pointer transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                padding: "7px 12px",
                fontSize: 12,
                fontWeight: 500,
                color: CHROME.text,
                background: "transparent",
                border: `1px solid ${CHROME.line}`,
                borderRadius: 6,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={busy}
              className="cursor-pointer transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                padding: "7px 14px",
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                background: CHROME.accent,
                border: `1px solid ${CHROME.accent}`,
                borderRadius: 6,
                letterSpacing: "-0.005em",
              }}
            >
              {busy ? "Generating…" : "Generate link"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── back-to-edit ───────────────────────────────────────────────────────────

function BackToEditButton() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleClick() {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("preview");
    // Keep `edit=1` and any other existing params; replace the URL so the
    // current scroll/state is preserved when the editor shell remounts.
    router.replace(`${url.pathname}${url.search}${url.hash}`);
    // useSearchParams subscribes to router state — the replace will trigger
    // EditChrome to re-render and route to EditShell automatically.
    void searchParams;
  }

  return (
    <button
      type="button"
      title="Back to editor"
      onClick={handleClick}
      className="cursor-pointer transition"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 28,
        padding: "0 10px 0 8px",
        background: CHROME.accent,
        color: "#fff",
        border: 0,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "-0.005em",
      }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m12 19-7-7 7-7" />
        <path d="M19 12H5" />
      </svg>
      Back to edit
    </button>
  );
}

// ── inline error toast ────────────────────────────────────────────────────

function ErrorToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="fixed bottom-[68px] right-[24px] z-[201] max-w-[320px] rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-900 shadow-lg"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-2 rounded-sm px-1 text-rose-700 transition hover:bg-rose-100 hover:text-rose-900"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
