"use client";

/**
 * WebsiteCardDesignClient — the interactive Card Design studio (P2.2).
 *
 * LEFT  : a 3-tile kit chooser (editorial-noir / magazine / minimal-portrait)
 *         + a thin row of color knobs for card.surface / card.name-color /
 *         card.muted (empty = inherit from the theme).
 * RIGHT : a LIVE preview rendering the canonical <TalentCard> against a
 *         realistic sample talent. The preview wrapper sets
 *         --token-card-surface / -name-color / -muted from the working draft
 *         inline, so every edit repaints the card instantly — exactly what the
 *         live storefront card will look like once published.
 *
 * Picking a kit calls applyCardKitFromEditAction; a knob edit calls
 * saveDesignDraftFromEditAction (the existing token-save path). Both write the
 * DRAFT only — a persistent Publish button promotes the draft to live and
 * syncs every card surface through the token cascade.
 *
 * Admin chrome is neutral / cool. The ONLY gold on this screen lives INSIDE the
 * right-hand preview — that is the public editorial card painting from its own
 * tokens, not admin chrome.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { TalentCard } from "@/components/talent-cards/TalentCard";
import type { DirectoryCardData } from "@/components/talent-cards/talent-card-shape";
import {
  applyCardKitFromEditAction,
  publishDesignFromEditAction,
  restoreDesignRevisionFromEditAction,
  saveDesignDraftFromEditAction,
} from "@/lib/site-admin/edit-mode/design-actions";

// ── neutral / cool admin palette (matches the Website surface chrome) ────────
const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  green: "#2E7D5B",
  greenSoft: "rgba(46,125,91,0.10)",
  red: "#9B1C1C",
  redSoft: "rgba(155,28,28,0.08)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ── shapes shared with the server page ───────────────────────────────────────
export type CardDesignRevision = {
  id: string;
  kind: "draft" | "published" | "rollback";
  version: number;
  createdAt: string;
};

type Kit = {
  slug: string;
  label: string;
  description: string;
  tokens: Record<string, string>;
};

interface Props {
  workspaceName: string;
  canEdit: boolean;
  canPublish: boolean;
  kits: Kit[];
  draftCardTokens: Record<string, string>;
  liveCardTokens: Record<string, string>;
  version: number;
  themePublishedAt: string | null;
  revisions: CardDesignRevision[];
}

// The three color knobs the studio exposes, in display order.
const COLOR_KNOBS: Array<{ key: string; label: string; hint: string }> = [
  { key: "card.surface", label: "Card surface", hint: "Media / panel ground" },
  { key: "card.name-color", label: "Name color", hint: "Talent name" },
  { key: "card.muted", label: "Secondary text", hint: "Type · location · availability" },
];

const FAMILY_KEY = "template.directory-card-family";

// A realistic sample talent for the preview. Editorial portrait imagery — never
// initials-in-a-box (product rule). Renders the editorial card so the name +
// muted tokens are visible (portrait keeps the name white over the scrim).
const SAMPLE_TALENT: DirectoryCardData = {
  id: "preview-sample",
  name: "Mara Delacroix",
  profileCode: null,
  profileHref: "#",
  primaryType: "Editorial Model",
  location: "Mexico City",
  photoUrl:
    "https://images.unsplash.com/photo-1492288991661-058aa541ff43?auto=format&fit=crop&w=900&q=80",
  agencyName: "Casa Noir",
  isExclusive: true,
  availabilityLabel: "Available this month",
  availabilityKnown: true,
  availableDaysInNext30: 12,
};

function isHex(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function WebsiteCardDesignClient({
  workspaceName,
  canEdit,
  canPublish,
  kits,
  draftCardTokens,
  liveCardTokens,
  version: initialVersion,
  themePublishedAt: initialPublishedAt,
  revisions: initialRevisions,
}: Props) {
  const router = useRouter();

  // Working draft — the operator's in-flight card tokens. Seeded from the
  // server draft; every save sends the FULL working copy (replace semantics).
  const [draft, setDraft] = React.useState<Record<string, string>>(draftCardTokens);
  const [live] = React.useState<Record<string, string>>(liveCardTokens);
  const [version, setVersion] = React.useState(initialVersion);
  const [publishedAt, setPublishedAt] = React.useState(initialPublishedAt);
  const [revisions] = React.useState(initialRevisions);

  // Explicit async state — never a silent wait or a toast-and-vanish.
  type SaveState =
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved"; version: number }
    | { kind: "error"; message: string };
  const [saveState, setSaveState] = React.useState<SaveState>({ kind: "idle" });
  const [publishState, setPublishState] = React.useState<
    | { kind: "idle" }
    | { kind: "publishing" }
    | { kind: "published"; version: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [pendingKit, setPendingKit] = React.useState<string | null>(null);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);

  // Has the draft diverged from live? Drives the "unpublished changes" hint.
  const dirty = React.useMemo(
    () =>
      [FAMILY_KEY, ...COLOR_KNOBS.map((k) => k.key)].some(
        (k) => (draft[k] ?? "") !== (live[k] ?? ""),
      ),
    [draft, live],
  );

  const activeFamily = draft[FAMILY_KEY] ?? "";

  // ── persist the full working draft via the token-save path ──────────────────
  const saveDraft = React.useCallback(
    async (next: Record<string, string>, expected: number) => {
      setSaveState({ kind: "saving" });
      const res = await saveDesignDraftFromEditAction({
        patch: next,
        expectedVersion: expected,
      });
      if (!res.ok) {
        // A version conflict means another editor moved the row — surface it
        // and refresh so the operator re-seeds from the current draft.
        setSaveState({ kind: "error", message: res.error });
        if (res.code === "VERSION_CONFLICT") router.refresh();
        return;
      }
      setVersion(res.version);
      setSaveState({ kind: "saved", version: res.version });
    },
    [router],
  );

  // Knob edits debounce so dragging a native color picker doesn't spam saves.
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleKnobChange = React.useCallback(
    (key: string, value: string) => {
      const next = { ...draft, [key]: value };
      setDraft(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void saveDraft(next, version);
      }, 350);
    },
    [draft, version, saveDraft],
  );

  // ── apply a kit (one-click repaint) ─────────────────────────────────────────
  const handleApplyKit = React.useCallback(
    async (kit: Kit) => {
      if (!canEdit) return;
      setPendingKit(kit.slug);
      setSaveState({ kind: "saving" });
      const res = await applyCardKitFromEditAction({ kitSlug: kit.slug });
      setPendingKit(null);
      if (!res.ok) {
        setSaveState({ kind: "error", message: res.error });
        if (res.code === "VERSION_CONFLICT") router.refresh();
        return;
      }
      // Reflect the kit's tokens in the local working draft so the preview
      // repaints immediately without a round-trip refresh.
      setDraft((prev) => ({ ...prev, ...kit.tokens }));
      setVersion(res.version);
      setSaveState({ kind: "saved", version: res.version });
    },
    [canEdit, router],
  );

  // ── publish (promote draft → live) ──────────────────────────────────────────
  const handlePublish = React.useCallback(async () => {
    if (!canPublish) return;
    setPublishState({ kind: "publishing" });
    const res = await publishDesignFromEditAction({ expectedVersion: version });
    if (!res.ok) {
      setPublishState({ kind: "error", message: res.error });
      if (res.code === "VERSION_CONFLICT") router.refresh();
      return;
    }
    setVersion(res.version);
    setPublishedAt(new Date().toISOString());
    setPublishState({ kind: "published", version: res.version });
    // Re-seed live from the now-published draft so `dirty` clears.
    router.refresh();
  }, [canPublish, version, router]);

  // ── restore a revision (lands as a fresh draft) ─────────────────────────────
  const handleRestore = React.useCallback(
    async (rev: CardDesignRevision) => {
      if (!canEdit) return;
      setRestoringId(rev.id);
      const res = await restoreDesignRevisionFromEditAction({
        revisionId: rev.id,
        expectedVersion: version,
      });
      setRestoringId(null);
      if (!res.ok) {
        setSaveState({ kind: "error", message: res.error });
        if (res.code === "VERSION_CONFLICT") router.refresh();
        return;
      }
      setVersion(res.version);
      setSaveState({ kind: "saved", version: res.version });
      // The restored draft replaces the working copy — refresh to re-seed.
      router.refresh();
    },
    [canEdit, version, router],
  );

  // Inline CSS vars the preview wrapper reads — empty token = no var = the
  // <TalentCard> falls back to the theme color (the inherit contract).
  const previewVars: React.CSSProperties = {
    ...(isHex(draft["card.surface"] ?? "")
      ? { ["--token-card-surface" as string]: draft["card.surface"] }
      : {}),
    ...(isHex(draft["card.name-color"] ?? "")
      ? { ["--token-card-name-color" as string]: draft["card.name-color"] }
      : {}),
    ...(isHex(draft["card.muted"] ?? "")
      ? { ["--token-card-muted" as string]: draft["card.muted"] }
      : {}),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: FONT }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent, marginBottom: 4 }}>
            {workspaceName}
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: C.ink, margin: 0, lineHeight: 1.1 }}>
            Card Design
          </h1>
          <div style={{ marginTop: 4, fontSize: 12.5, color: C.inkMuted, maxWidth: 560, lineHeight: 1.5 }}>
            Pick a look or tune the colors once. Publish to sync every talent card across your directory, profile, and embeds.
          </div>
        </div>
        <PublishCluster
          canPublish={canPublish}
          dirty={dirty}
          publishState={publishState}
          publishedAt={publishedAt}
          onPublish={handlePublish}
        />
      </div>

      {!canEdit && (
        <div style={{ fontSize: 12, fontWeight: 600, color: C.inkMuted }}>Read-only — you do not have design edit access.</div>
      )}

      {/* ── Two columns ── */}
      <div
        data-card-design-grid
        style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 28, alignItems: "start" }}
      >
        {/* LEFT — controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          {/* Kit chooser */}
          <section
            style={{
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <SectionHeader title="Looks" hint="A one-click kit repaints every card. You can fine-tune the colors after." />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              {kits.map((kit) => {
                const selected = activeFamily === kit.slug;
                const busy = pendingKit === kit.slug;
                return (
                  <button
                    key={kit.slug}
                    type="button"
                    disabled={!canEdit || busy}
                    onClick={() => void handleApplyKit(kit)}
                    aria-pressed={selected}
                    style={{
                      textAlign: "left",
                      padding: 12,
                      borderRadius: 10,
                      border: `1.5px solid ${selected ? C.accent : C.border}`,
                      background: selected ? C.accentSoft : C.cardBg,
                      cursor: !canEdit || busy ? "default" : "pointer",
                      opacity: !canEdit ? 0.6 : 1,
                      transition: "border-color 120ms, background 120ms",
                      fontFamily: FONT,
                    }}
                  >
                    <KitSwatch tokens={kit.tokens} />
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{kit.label}</span>
                      {selected && (
                        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: C.accent }}>
                          {busy ? "Applying" : "Active"}
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 11.5, color: C.inkMuted, lineHeight: 1.4 }}>{kit.description}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Color knobs */}
          <section
            style={{
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <SectionHeader title="Colors" hint="Leave a swatch empty to inherit that color from your theme." />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {COLOR_KNOBS.map((knob) => (
                <ColorKnob
                  key={knob.key}
                  label={knob.label}
                  hint={knob.hint}
                  value={draft[knob.key] ?? ""}
                  disabled={!canEdit}
                  onChange={(v) => handleKnobChange(knob.key, v)}
                  onClear={() => handleKnobChange(knob.key, "")}
                />
              ))}
            </div>
            <SaveStatus state={saveState} />
          </section>

          {/* Revisions */}
          {revisions.length > 0 && (
            <section
              style={{
                background: C.cardBg,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 16,
              }}
            >
              <SectionHeader title="History" hint="Restore a prior design as a draft, then publish to make it live." />
              <div style={{ display: "flex", flexDirection: "column" }}>
                {revisions.map((rev, i) => (
                  <div
                    key={rev.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "9px 0",
                      borderTop: i === 0 ? "none" : `1px solid ${C.borderSoft}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: C.ink, textTransform: "capitalize" }}>
                        {rev.kind} · v{rev.version}
                      </div>
                      <div style={{ fontSize: 11, color: C.inkDim, marginTop: 1 }}>{fmtDate(rev.createdAt)}</div>
                    </div>
                    <button
                      type="button"
                      disabled={!canEdit || restoringId === rev.id}
                      onClick={() => void handleRestore(rev)}
                      style={{
                        padding: "4px 10px",
                        fontSize: 11.5,
                        fontWeight: 600,
                        fontFamily: FONT,
                        border: `1px solid ${C.border}`,
                        borderRadius: 6,
                        background: C.cardBg,
                        color: C.ink,
                        cursor: !canEdit || restoringId === rev.id ? "default" : "pointer",
                        opacity: !canEdit ? 0.5 : 1,
                      }}
                    >
                      {restoringId === rev.id ? "Restoring…" : "Restore"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* RIGHT — live preview. The ONLY place gold may appear (it's the public card). */}
        <div style={{ position: "sticky", top: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: C.inkMuted }}>
            Live preview
          </div>
          <div
            style={{
              padding: 18,
              borderRadius: 14,
              border: `1px solid ${C.border}`,
              // Neutral checker-free mount; the card paints its own surface from
              // the tokens so the preview reads true against a quiet ground.
              background: C.surface,
              ...previewVars,
            }}
          >
            <div style={{ maxWidth: 240, margin: "0 auto" }}>
              <TalentCard
                data={SAMPLE_TALENT}
                style="editorial"
                show={{
                  showName: true,
                  showTalentType: true,
                  showLocation: true,
                  showAvailability: true,
                  showBadges: true,
                }}
                nameFallback="role"
                aspect="4:5"
                priority
              />
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.inkDim, lineHeight: 1.45 }}>
            This is exactly how your talent card renders on the live site. Edits show here instantly; Publish makes them live everywhere.
          </div>
        </div>
      </div>

      {/* Responsive: stack the preview under the controls on narrow widths */}
      <style>{`
        @media (max-width: 880px) {
          [data-card-design-grid] { grid-template-columns: 1fr !important; }
          [data-card-design-grid] > div:last-child { position: static !important; }
        }
      `}</style>
    </div>
  );
}

// ── sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{title}</div>
      <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2, lineHeight: 1.4 }}>{hint}</div>
    </div>
  );
}

/** A tiny tri-swatch preview of a kit's surface / name / muted colors. */
function KitSwatch({ tokens }: { tokens: Record<string, string> }) {
  const surface = tokens["card.surface"] ?? "#f4f4f5";
  const name = tokens["card.name-color"] ?? "#171717";
  const muted = tokens["card.muted"] ?? "#6b7280";
  return (
    <div
      style={{
        height: 48,
        borderRadius: 8,
        background: surface,
        border: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        gap: 4,
        padding: 8,
      }}
    >
      <span style={{ width: "70%", height: 6, borderRadius: 3, background: name }} />
      <span style={{ width: "45%", height: 5, borderRadius: 3, background: muted }} />
    </div>
  );
}

function ColorKnob({
  label,
  hint,
  value,
  disabled,
  onChange,
  onClear,
}: {
  label: string;
  hint: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  const hasValue = isHex(value);
  // The native color input needs a concrete hex; show a neutral when inherited.
  const swatchValue = hasValue ? value : "#cccccc";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "9px 0",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>{label}</div>
        <div style={{ fontSize: 11, color: C.inkDim, marginTop: 1 }}>
          {hasValue ? hint : `${hint} · inherits theme`}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="color"
          aria-label={label}
          disabled={disabled}
          value={swatchValue}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 34,
            height: 28,
            padding: 0,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            background: C.cardBg,
            cursor: disabled ? "default" : "pointer",
            opacity: hasValue ? 1 : 0.55,
          }}
        />
        {hasValue && !disabled && (
          <button
            type="button"
            onClick={onClear}
            style={{
              padding: "3px 8px",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: FONT,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              background: C.cardBg,
              color: C.inkMuted,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function SaveStatus({
  state,
}: {
  state:
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved"; version: number }
    | { kind: "error"; message: string };
}) {
  if (state.kind === "idle") return null;
  let label: string;
  let color: string;
  let bg: string;
  if (state.kind === "saving") {
    label = "Saving draft…";
    color = C.inkMuted;
    bg = C.surface;
  } else if (state.kind === "saved") {
    label = `Draft saved (v${state.version})`;
    color = C.green;
    bg = C.greenSoft;
  } else {
    label = state.message;
    color = C.red;
    bg = C.redSoft;
  }
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        marginTop: 12,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 6,
        background: bg,
        color,
        fontSize: 11.5,
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  );
}

function PublishCluster({
  canPublish,
  dirty,
  publishState,
  publishedAt,
  onPublish,
}: {
  canPublish: boolean;
  dirty: boolean;
  publishState:
    | { kind: "idle" }
    | { kind: "publishing" }
    | { kind: "published"; version: number }
    | { kind: "error"; message: string };
  publishedAt: string | null;
  onPublish: () => void;
}) {
  const publishing = publishState.kind === "publishing";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <button
        type="button"
        disabled={!canPublish || publishing}
        onClick={onPublish}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 700,
          fontFamily: FONT,
          border: "none",
          borderRadius: 8,
          background: canPublish ? C.accent : "rgba(11,11,13,0.18)",
          color: "#fff",
          cursor: !canPublish || publishing ? "default" : "pointer",
          opacity: publishing ? 0.7 : 1,
        }}
      >
        {publishing ? "Publishing…" : "Publish"}
      </button>
      <div style={{ fontSize: 11, color: publishState.kind === "error" ? C.red : C.inkMuted, textAlign: "right" }}>
        {publishState.kind === "error"
          ? publishState.message
          : publishState.kind === "published"
            ? `Published (v${publishState.version}) — live everywhere`
            : !canPublish
              ? "You can edit the draft; publishing needs publish access."
              : dirty
                ? "Unpublished changes in the draft."
                : publishedAt
                  ? `Live · last published ${fmtDate(publishedAt)}`
                  : "Nothing published yet."}
      </div>
    </div>
  );
}
