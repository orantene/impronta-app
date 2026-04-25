"use client";

/**
 * EditTopBar — mission control bar for the canvas editor.
 *
 * Layout (left to right):
 *   Brand mark → divider → page picker → save status → divider →
 *   undo/redo → [spacer] → viewport switcher → [spacer] →
 *   page-settings · revisions · preview · share → divider →
 *   Save draft · Publish split-button → divider → Exit
 *
 * Matches mockup surface 1 exactly — tokens, heights, radii, shadows.
 * Visual language: 54px glass bar, warm-white tint, hairline border.
 */

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { exitEditModeAction } from "@/lib/site-admin/edit-mode/server";
import type { EditDevice } from "./edit-context";
import { CHROME } from "./kit";

const TOPBAR_H = 54;

// ── helpers ──────────────────────────────────────────────────────────────────

function TbDivider() {
  return (
    <span
      aria-hidden
      className="shrink-0"
      style={{
        width: 1,
        height: 24,
        background: CHROME.lineMid,
        margin: "0 4px",
      }}
    />
  );
}

interface TbIconBtnProps {
  title: string;
  ariaLabel?: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: number;
  children: React.ReactNode;
}

function TbIconBtn({
  title,
  ariaLabel,
  onClick,
  disabled,
  badge,
  children,
}: TbIconBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel ?? title}
      className="relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-transparent transition-colors disabled:cursor-not-allowed"
      style={{
        width: 32,
        height: 32,
        background: "transparent",
        color: CHROME.muted,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = CHROME.paper2;
          e.currentTarget.style.color = CHROME.ink;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = disabled ? CHROME.muted3 : CHROME.muted;
      }}
    >
      {children}
      {badge != null && badge > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-[1px] top-[1px] inline-flex min-w-[14px] items-center justify-center rounded-[7px] px-[3px] text-[9px] font-bold text-white"
          style={{
            height: 14,
            background: CHROME.rose,
            border: `1.5px solid ${CHROME.surface}`,
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

function BrandMark() {
  return (
    <div className="inline-flex shrink-0 items-center gap-[10px] pr-3">
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-[7px] text-[12px] font-bold text-white"
        style={{
          width: 26,
          height: 26,
          background: CHROME.ink,
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10)",
        }}
        aria-hidden
      >
        T
      </span>
      <span
        className="text-[13px] font-bold tracking-[-0.01em]"
        style={{ color: CHROME.ink }}
      >
        Tulala
      </span>
    </div>
  );
}

function PagePicker({ title }: { title: string }) {
  return (
    <button
      type="button"
      title="Switch page"
      className="inline-flex shrink-0 items-center gap-[7px] rounded-[7px] border border-transparent transition-colors"
      style={{
        padding: "5px 9px 5px 11px",
        fontSize: 12.5,
        fontWeight: 500,
        color: CHROME.ink,
        background: "transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = CHROME.paper2;
        e.currentTarget.style.borderColor = CHROME.line;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderColor = "transparent";
      }}
    >
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-[4px]"
        style={{
          width: 18,
          height: 18,
          background: CHROME.paper2,
          color: CHROME.muted,
        }}
        aria-hidden
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </span>
      <span className="font-semibold tracking-[-0.005em]" style={{ color: CHROME.ink }}>
        {title || "Homepage"}
      </span>
      <span style={{ color: CHROME.muted2 }} aria-hidden>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </button>
  );
}

function SaveStatus({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  const [justSaved, setJustSaved] = useState(false);
  const wasSavingRef = useRef(false);

  useEffect(() => {
    if (wasSavingRef.current && !saving && !dirty) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 1600);
      wasSavingRef.current = saving;
      return () => clearTimeout(t);
    }
    wasSavingRef.current = saving;
  }, [saving, dirty]);

  const dot = "inline-block shrink-0 rounded-full";

  if (saving) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-[6px] rounded-full border text-[11px] font-semibold"
        style={{
          padding: "4px 11px 4px 9px",
          background: CHROME.blueBg,
          color: CHROME.blue,
          borderColor: CHROME.blueLine,
        }}
      >
        <span
          className={`${dot} animate-pulse`}
          style={{ width: 6, height: 6, background: CHROME.blue, boxShadow: "0 0 8px rgba(58,123,255,0.6)" }}
          aria-hidden
        />
        Saving…
      </span>
    );
  }
  if (dirty) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-[6px] rounded-full border text-[11px] font-semibold"
        style={{
          padding: "4px 11px 4px 9px",
          background: CHROME.amberBg,
          color: CHROME.amber,
          borderColor: CHROME.amberLine,
        }}
      >
        <span
          className={dot}
          style={{ width: 6, height: 6, background: CHROME.amber, boxShadow: "0 0 8px rgba(180,83,9,0.6)" }}
          aria-hidden
        />
        Unsaved
      </span>
    );
  }
  if (justSaved) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-[6px] rounded-full border text-[11px] font-semibold"
        style={{
          padding: "4px 11px 4px 9px",
          background: CHROME.greenBg,
          color: CHROME.green,
          borderColor: CHROME.greenLine,
        }}
      >
        <span
          className={dot}
          style={{ width: 6, height: 6, background: CHROME.green, boxShadow: "0 0 8px rgba(20,115,46,0.6)" }}
          aria-hidden
        />
        Saved
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-[6px] rounded-full border text-[11px] font-semibold"
      style={{
        padding: "4px 11px 4px 9px",
        background: CHROME.greenBg,
        color: CHROME.green,
        borderColor: CHROME.greenLine,
        opacity: 0.7,
      }}
    >
      <span
        className={dot}
        style={{ width: 6, height: 6, background: CHROME.green }}
        aria-hidden
      />
      Saved
    </span>
  );
}

const VIEWPORT_OPTS: ReadonlyArray<{
  key: EditDevice;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    key: "desktop",
    label: "Desktop",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    key: "tablet",
    label: "Tablet",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="4" y="2" width="16" height="20" rx="2" />
      </svg>
    ),
  },
  {
    key: "mobile",
    label: "Mobile",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="7" y="2" width="10" height="20" rx="2" />
      </svg>
    ),
  },
];

function ViewportSwitcher({
  device,
  setDevice,
}: {
  device: EditDevice;
  setDevice: (d: EditDevice) => void;
}) {
  return (
    <div
      className="inline-flex shrink-0 items-center rounded-full p-[3px]"
      style={{
        background: "rgba(0,0,0,0.05)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)",
      }}
    >
      {VIEWPORT_OPTS.map((opt) => {
        const active = device === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => setDevice(opt.key)}
            title={opt.label}
            className="inline-flex items-center gap-[5px] rounded-full border-none px-[13px] py-[5px] text-[12px] font-semibold tracking-[-0.005em] transition-all"
            style={{
              background: active ? CHROME.surface : "transparent",
              color: active ? CHROME.ink : CHROME.muted,
              boxShadow: active
                ? "0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)"
                : "none",
              cursor: "pointer",
            }}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function TbTextBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex shrink-0 cursor-pointer items-center gap-[6px] rounded-[7px] border border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        height: 32,
        padding: "0 12px",
        fontSize: 12.5,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        color: CHROME.text2,
        background: "transparent",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = CHROME.paper2;
          e.currentTarget.style.color = CHROME.ink;
          e.currentTarget.style.borderColor = CHROME.line;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = CHROME.text2;
        e.currentTarget.style.borderColor = "transparent";
      }}
    >
      {children}
    </button>
  );
}

type PublishMenuOption = "schedule" | "save-draft" | "discard";

function PublishSplitButton({
  onPublish,
  onMenuSelect,
  disabled,
}: {
  onPublish: () => void;
  onMenuSelect: (opt: PublishMenuOption) => void;
  disabled?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-publish-split]")) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div className="relative shrink-0" data-publish-split>
      <div
        className="inline-flex items-stretch overflow-hidden rounded-[7px]"
        style={{
          height: 32,
          background: CHROME.ink,
          boxShadow:
            "0 1px 2px rgba(0,0,0,0.10), inset 0 0 0 1px rgba(255,255,255,0.10)",
        }}
      >
        <button
          type="button"
          onClick={onPublish}
          disabled={disabled}
          className="cursor-pointer border-none text-[12.5px] font-semibold tracking-[-0.005em] text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ padding: "0 14px", background: "transparent" }}
        >
          Publish
        </button>
        <span
          aria-hidden
          style={{ width: 1, background: "rgba(255,255,255,0.18)" }}
        />
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Publish options"
          className="inline-flex cursor-pointer items-center justify-center border-none transition hover:bg-white/10"
          style={{
            width: 28,
            background: "transparent",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {menuOpen ? (
        <div
          className="absolute right-0 top-[42px] z-[120] min-w-[240px] rounded-[10px] p-[6px] text-[12.5px]"
          style={{
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            boxShadow:
              "0 24px 64px -16px rgba(0,0,0,0.20), 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(24,24,27,0.07)",
          }}
        >
          <MenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
            title="Schedule publish…"
            description="Choose a date and time"
            onClick={() => { onMenuSelect("schedule"); setMenuOpen(false); }}
          />
          <div
            aria-hidden
            style={{ height: 1, background: CHROME.line, margin: "4px 2px" }}
          />
          <MenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            }
            title="Save as named draft…"
            description="Checkpoint without publishing"
            shortcut="⌘S"
            onClick={() => { onMenuSelect("save-draft"); setMenuOpen(false); }}
          />
          <MenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="18" y1="2" x2="22" y2="6" />
                <path d="M7.5 20.5 19 9l-4-4L3.5 16.5z" />
              </svg>
            }
            title="Discard draft"
            description="Revert to the live version"
            onClick={() => { onMenuSelect("discard"); setMenuOpen(false); }}
          />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  title,
  description,
  shortcut,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  shortcut?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className="flex cursor-pointer items-center gap-[10px] rounded-[6px] px-[10px] py-[8px] transition-colors"
      style={{ color: CHROME.text }}
      onClick={onClick}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = CHROME.paper2;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
      role="menuitem"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.();
      }}
    >
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-[5px]"
        style={{
          width: 24,
          height: 24,
          background: CHROME.paper2,
          color: CHROME.ink,
        }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex-1">
        <span className="block font-semibold tracking-[-0.005em]" style={{ color: CHROME.ink, fontSize: 12.5 }}>
          {title}
        </span>
        <span className="block" style={{ fontSize: 11, color: CHROME.muted, marginTop: 1 }}>
          {description}
        </span>
      </span>
      {shortcut ? (
        <span
          className="shrink-0 rounded-[3px] border px-[5px] py-[2px] font-mono"
          style={{
            fontSize: 10.5,
            color: CHROME.muted2,
            background: CHROME.paper2,
            borderColor: CHROME.line,
          }}
        >
          {shortcut}
        </span>
      ) : null}
    </div>
  );
}

function ExitButton() {
  const { pending } = useFormStatus();
  return (
    <TbTextBtn disabled={pending}>
      {pending ? "Exiting…" : "Exit"}
    </TbTextBtn>
  );
}

// ── Main TopBar ───────────────────────────────────────────────────────────────

export interface TopBarProps {
  device: EditDevice;
  setDevice: (d: EditDevice) => void;
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPublish: () => void;
  /** Open the Page Settings drawer (cog icon in the right cluster). */
  onPageSettings?: () => void;
  /**
   * Save an explicit draft checkpoint. Resolves with the server timestamp
   * the surrounding chrome surfaces in its transient confirmation toast.
   * The button is disabled while a save is in flight.
   */
  onSaveDraft?: () => void | Promise<unknown>;
  pageTitle?: string;
}

export function TopBar({
  device,
  setDevice,
  dirty,
  saving,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPublish,
  onPageSettings,
  onSaveDraft,
  pageTitle,
}: TopBarProps) {
  function handleMenuSelect(opt: PublishMenuOption) {
    if (opt === "schedule") {
      // Phase 12 — placeholder
      console.info("[topbar] schedule publish: not yet implemented");
    } else if (opt === "save-draft") {
      // Same affordance as the Save draft text button — write a draft
      // revision row through the existing autosave path. Phase 4 layers
      // the named-draft prompt on top of this.
      if (onSaveDraft) void onSaveDraft();
    } else if (opt === "discard") {
      // Phase 4 — discard draft (revert to live snapshot)
      console.info("[topbar] discard draft: not yet implemented");
    }
  }

  function handlePreview() {
    // Open current page without ?edit=1 in a new tab so the operator sees
    // the visitor experience. Phase 9 replaces this with a full preview mode.
    const url = new URL(window.location.href);
    url.searchParams.delete("edit");
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }

  return (
    <div
      data-edit-topbar
      className="fixed inset-x-0 top-0 z-[90] flex items-center gap-[8px] px-[12px]"
      style={{
        height: TOPBAR_H,
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        borderBottom: `1px solid ${CHROME.line}`,
      }}
    >
      {/* ── Left cluster ── */}
      <BrandMark />
      <TbDivider />
      <PagePicker title={pageTitle ?? "Homepage"} />
      <SaveStatus dirty={dirty} saving={saving} />
      <TbDivider />

      {/* ── Undo / Redo ── */}
      <TbIconBtn
        title="Undo (⌘Z)"
        onClick={onUndo}
        disabled={!canUndo}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
        </svg>
      </TbIconBtn>
      <TbIconBtn
        title="Redo (⇧⌘Z)"
        onClick={onRedo}
        disabled={!canRedo}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 7v6h-6" />
          <path d="M3 17a9 9 0 0 1 15-6.7l3 2.7" />
        </svg>
      </TbIconBtn>

      {/* ── Spacer ── */}
      <span className="flex-1" />

      {/* ── Viewport switcher ── */}
      <ViewportSwitcher device={device} setDevice={setDevice} />

      {/* ── Spacer ── */}
      <span className="flex-1" />

      {/* ── Right icon cluster ── */}
      <TbIconBtn title="Page settings" onClick={onPageSettings}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </TbIconBtn>
      <TbIconBtn title="Revisions">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l3 2" />
        </svg>
      </TbIconBtn>
      <TbIconBtn title="Preview as visitor (⌘P)" onClick={handlePreview}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </TbIconBtn>
      <TbIconBtn title="Share preview link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
          <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
        </svg>
      </TbIconBtn>

      <TbDivider />

      {/* ── Save draft · Publish split ── */}
      <TbTextBtn
        title="Save a draft checkpoint"
        disabled={saving || !onSaveDraft}
        onClick={onSaveDraft ? () => void onSaveDraft() : undefined}
      >
        Save draft
      </TbTextBtn>
      <PublishSplitButton
        onPublish={onPublish}
        onMenuSelect={handleMenuSelect}
        disabled={saving}
      />

      <TbDivider />

      {/* ── Exit ── */}
      <form action={exitEditModeAction}>
        <ExitButton />
      </form>
    </div>
  );
}
