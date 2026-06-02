"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import { Check, Eye, Lock, X } from "lucide-react";

import { COLORS, FONTS, useAdminShell } from "@/components/admin/shell/internal/state";
import { PrimaryButton, SecondaryButton } from "@/components/admin/shell/internal/primitives";
import { applyTalentSiteTemplateAction } from "@/lib/talent-site/server/actions";
import {
  CATEGORY_BLURB,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
} from "@/lib/talent-site/templates/categories";
import type { TalentSiteTemplateKey, TemplateCategory } from "@/lib/talent-site/templates/types";
import type { TalentSiteLocale } from "@/lib/talent-site/talent-site-i18n";
import type { TalentSiteDashboardState, TalentSiteTemplateCardDTO } from "@/lib/talent-site/types";

type Props = {
  state: TalentSiteDashboardState;
  locale?: TalentSiteLocale;
  onChanged: () => void | Promise<void>;
};

const TIER_LABEL: Record<"free" | "pro" | "max", string> = {
  free: "Free",
  pro: "Pro",
  max: "Max",
};

export function TalentSiteTemplatePanel({ state, onChanged }: Props) {
  const { openDrawer } = useAdminShell();
  const [open, setOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = state.availableTemplates.find((t) => t.key === state.templateKey);

  const grouped = useMemo(() => {
    const byCat = new Map<TemplateCategory, TalentSiteTemplateCardDTO[]>();
    for (const t of state.availableTemplates) {
      const list = byCat.get(t.category) ?? [];
      list.push(t);
      byCat.set(t.category, list);
    }
    return CATEGORY_ORDER.map((cat) => ({ cat, items: byCat.get(cat) ?? [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [state.availableTemplates]);

  const previewing = previewKey
    ? state.availableTemplates.find((t) => t.key === previewKey) ?? null
    : null;

  function applyTemplate(templateKey: string) {
    if (!state.site) return;
    startTransition(async () => {
      setError(null);
      const result = await applyTalentSiteTemplateAction({
        templateKey: templateKey as TalentSiteTemplateKey,
        expectedVersion: state.site!.version,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreviewKey(null);
      setOpen(false);
      await onChanged();
    });
  }

  function handleUpgrade() {
    setPreviewKey(null);
    openDrawer("talent-tier-compare");
  }

  return (
    <div
      style={{
        padding: "14px 16px",
        background: COLORS.surfaceAlt,
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase" }}>
            Template
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink, marginTop: 4 }}>
            {current?.label ?? "Tulala Signature"}
          </div>
          {current?.blurb ? (
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: COLORS.inkMuted, maxWidth: 520 }}>
              {current.blurb}
            </p>
          ) : null}
        </div>
        <SecondaryButton onClick={() => setOpen((v) => !v)} disabled={pending}>
          {open ? "Hide templates" : "Browse templates"}
        </SecondaryButton>
      </div>

      {state.tier === "free" ? (
        <p style={{ margin: "12px 0 0", fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5 }}>
          Currently on <strong>Free</strong> — pick any base template below. Preview the{" "}
          <strong>Pro</strong> profession designs with the eye icon, and upgrade to use them.
        </p>
      ) : null}

      {error ? (
        <p style={{ marginTop: 10, fontSize: 12, color: COLORS.criticalDeep }}>{error}</p>
      ) : null}

      {open ? (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 22 }}>
          {grouped.map((group) => (
            <div key={group.cat}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.ink }}>
                  {CATEGORY_LABEL[group.cat]}
                </div>
                <div style={{ fontSize: 11, color: COLORS.inkDim, marginTop: 2 }}>
                  {CATEGORY_BLURB[group.cat]}
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
                  gap: 12,
                }}
              >
                {group.items.map((t) => (
                  <TemplateCard
                    key={t.key}
                    card={t}
                    isCurrent={t.key === state.templateKey}
                    onOpen={() => {
                      setError(null);
                      setPreviewKey(t.key);
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {previewing ? (
        <PreviewModal
          card={previewing}
          isCurrent={previewing.key === state.templateKey}
          pending={pending}
          onClose={() => setPreviewKey(null)}
          onUse={() => applyTemplate(previewing.key)}
          onUpgrade={handleUpgrade}
        />
      ) : null}
    </div>
  );
}

function TemplateCard({
  card,
  isCurrent,
  onOpen,
}: {
  card: TalentSiteTemplateCardDTO;
  isCurrent: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        position: "relative",
        textAlign: "left",
        padding: 8,
        borderRadius: 12,
        border: `1px solid ${isCurrent ? COLORS.accent : COLORS.borderSoft}`,
        background: "#fff",
        cursor: "pointer",
        fontFamily: FONTS.body,
        boxShadow: isCurrent ? `0 0 0 2px ${COLORS.accent}22` : "none",
      }}
    >
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 9,
          border: `1px solid ${COLORS.borderSoft}`,
          background: COLORS.surfaceAlt,
          aspectRatio: "8 / 5",
          marginBottom: 9,
          opacity: card.locked ? 0.62 : 1,
        }}
      >
        <Image
          src={card.thumbnailUrl}
          alt=""
          width={1200}
          height={750}
          sizes="(max-width: 720px) 80vw, 240px"
          style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
        />
        {/* eye affordance */}
        <span
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 999,
            background: "rgba(17,22,18,0.72)",
            color: "#fff",
            fontSize: 10.5,
            fontWeight: 600,
          }}
        >
          <Eye size={11} /> Preview
        </span>
        {card.locked ? (
          <span
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(125,92,255,0.92)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            <Lock size={10} /> {TIER_LABEL[card.tier]}
          </span>
        ) : null}
        {isCurrent ? (
          <span
            style={{
              position: "absolute",
              bottom: 8,
              left: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(34,140,90,0.95)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            <Check size={11} /> Current
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{card.label}</span>
        {!card.locked && card.tier !== "free" ? null : (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: card.tier === "free" ? COLORS.inkDim : COLORS.accentDeep,
            }}
          >
            {card.tier === "free" ? "Free" : TIER_LABEL[card.tier]}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 4, lineHeight: 1.35 }}>
        {card.blurb}
      </div>
    </button>
  );
}

function PreviewModal({
  card,
  isCurrent,
  pending,
  onClose,
  onUse,
  onUpgrade,
}: {
  card: TalentSiteTemplateCardDTO;
  isCurrent: boolean;
  pending: boolean;
  onClose: () => void;
  onUse: () => void;
  onUpgrade: () => void;
}) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(17,22,18,0.62)",
        backdropFilter: "blur(2px)",
        display: "flex",
        flexDirection: "column",
        padding: "max(16px, env(safe-area-inset-top)) 16px 16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          margin: "auto",
          width: "100%",
          maxWidth: 1120,
          height: "min(92vh, 920px)",
          background: "#fff",
          borderRadius: 16,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.5)",
          fontFamily: FONTS.body,
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 16px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>{card.label}</span>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: card.tier === "free" ? COLORS.inkDim : COLORS.accentDeep,
              }}
            >
              {TIER_LABEL[card.tier]}
            </span>
            <span style={{ fontSize: 12, color: COLORS.inkMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {card.blurb}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                display: "inline-flex",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              {(["desktop", "phone"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  style={{
                    border: "none",
                    cursor: "pointer",
                    padding: "5px 12px",
                    fontSize: 11.5,
                    fontWeight: 600,
                    background: device === d ? COLORS.ink : "transparent",
                    color: device === d ? "#fff" : COLORS.inkMuted,
                  }}
                >
                  {d === "desktop" ? "Desktop" : "Phone"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              style={{
                border: `1px solid ${COLORS.borderSoft}`,
                background: "#fff",
                borderRadius: 8,
                width: 32,
                height: 32,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: COLORS.ink,
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* preview frame */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            background: COLORS.surfaceAlt,
            display: "flex",
            justifyContent: "center",
            padding: device === "phone" ? "16px 0" : 0,
            overflow: "auto",
          }}
        >
          <iframe
            title={`${card.label} preview`}
            src={`/template-preview/${card.key}`}
            style={{
              border: device === "phone" ? `1px solid ${COLORS.borderSoft}` : "none",
              borderRadius: device === "phone" ? 24 : 0,
              width: device === "phone" ? 390 : "100%",
              maxWidth: "100%",
              height: "100%",
              background: "#fff",
            }}
          />
        </div>

        {/* footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 16px",
            borderTop: `1px solid ${COLORS.borderSoft}`,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12, color: COLORS.inkMuted }}>
            {card.locked
              ? "This design is part of Pro. Preview it free — upgrade to make it yours."
              : isCurrent
                ? "This is your current template."
                : "Applying replaces your current layout with this design, using your profile content."}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={`/template-preview/${card.key}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                color: COLORS.ink,
                textDecoration: "none",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
              }}
            >
              Open in new tab ↗
            </a>
            {card.locked ? (
              <PrimaryButton onClick={onUpgrade}>Upgrade to {TIER_LABEL[card.tier]}</PrimaryButton>
            ) : (
              <PrimaryButton onClick={onUse} disabled={pending || isCurrent}>
                {pending ? "Applying…" : isCurrent ? "Current template" : "Use this template"}
              </PrimaryButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
