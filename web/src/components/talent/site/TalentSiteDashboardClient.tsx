"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import { COLORS, FONTS, useAdminShell } from "@/components/admin/shell/internal/state";
import { PrimaryButton } from "@/components/admin/shell/internal/primitives";
import { SectionHeader } from "@/components/admin/shell/internal/talent/shared/today-2";
import { mergeTalentSiteDashboardWithShellTier } from "@/lib/talent-site/merge-shell-tier";
import {
  createTalentPersonalSiteDraftAction,
  fetchTalentPersonalSiteDashboardStateAction,
} from "@/lib/talent-site/server/actions";
import type { TalentSiteDashboardState } from "@/lib/talent-site/types";
import { TalentSiteEditorForm } from "./TalentSiteEditorForm";
import { TalentSiteLockedCard } from "./TalentSiteLockedCard";

type Props = {
  initialState: TalentSiteDashboardState;
  /** Refetch dashboard state after create/save (client-loaded panel). */
  onReload?: () => void | Promise<void>;
};

export function TalentSiteDashboardClient({ initialState, onReload }: Props) {
  const { openDrawer, state: shellState } = useAdminShell();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [baseState, setBaseState] = useState(initialState);

  useEffect(() => {
    setBaseState(initialState);
  }, [initialState]);

  const state = useMemo(
    () => mergeTalentSiteDashboardWithShellTier(baseState, shellState.talentTier),
    [baseState, shellState.talentTier],
  );

  const locked = !state.canBuildPersonalSite;
  const hasSite = state.site != null;
  const draftSnapshot = state.site?.draftSnapshot;

  async function reloadDashboard() {
    const loaded = await fetchTalentPersonalSiteDashboardStateAction();
    if (loaded.ok) {
      setBaseState(loaded.state);
    }
    await onReload?.();
  }

  function handleCreate() {
    startTransition(async () => {
      setError(null);
      const result = await createTalentPersonalSiteDraftAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await reloadDashboard();
    });
  }

  return (
    <section data-tulala-talent-personal-site>
      <SectionHeader
        icon="sparkle"
        iconTone="royal"
        title="My personal site"
        subtitle="Your owned Tulala page — separate from agency roster pages."
      />

      {state.publicSiteUrl ? (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 14,
            padding: "6px 12px",
            background: COLORS.surfaceAlt,
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 999,
            fontFamily: FONTS.body,
            fontSize: 12,
          }}
        >
          <span style={{ color: COLORS.inkMuted, fontWeight: 600 }}>URL</span>
          <Link
            href={state.publicSiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: COLORS.ink,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {state.publicSiteUrl} ↗
          </Link>
        </div>
      ) : (
        <div
          style={{
            marginBottom: 14,
            fontFamily: FONTS.body,
            fontSize: 12,
            color: COLORS.inkDim,
          }}
        >
          Set a profile code first to claim your URL.
        </div>
      )}

      {locked ? (
        <TalentSiteLockedCard state={state} onUpgrade={() => openDrawer("talent-tier-compare")} />
      ) : !hasSite ? (
        <div
          style={{
            background: `linear-gradient(135deg, ${COLORS.royalSoft} 0%, ${COLORS.surfaceAlt} 70%)`,
            border: `1px solid rgba(95,75,139,0.18)`,
            borderRadius: 14,
            padding: "20px 22px",
            fontFamily: FONTS.body,
          }}
        >
          <div
            style={{
              fontFamily: FONTS.display,
              fontSize: 16,
              fontWeight: 600,
              color: COLORS.ink,
              letterSpacing: -0.2,
            }}
          >
            Create your personal site
          </div>
          <p
            style={{
              margin: "6px 0 14px",
              fontSize: 12.5,
              color: COLORS.inkMuted,
              lineHeight: 1.5,
              maxWidth: 560,
            }}
          >
            We&apos;ll generate a starter layout from your public profile — hero, about, gallery,
            and contact CTA. You can edit copy and publish when ready.
          </p>
          <PrimaryButton onClick={handleCreate} disabled={pending}>
            {pending ? "Creating…" : "Create your personal site"}
          </PrimaryButton>
          {error ? (
            <p style={{ marginTop: 12, fontSize: 12.5, color: COLORS.criticalDeep }}>{error}</p>
          ) : null}
        </div>
      ) : (
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 14,
            padding: "16px 18px",
            fontFamily: FONTS.body,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <StatusStrip state={state} />
          <PreviewLinks state={state} />
          {draftSnapshot ? (
            <TalentSiteEditorForm
              state={state}
              initialSnapshot={draftSnapshot}
              onSaved={() => void reloadDashboard()}
            />
          ) : (
            <p style={{ fontSize: 12.5, color: COLORS.inkMuted, margin: 0 }}>
              Draft snapshot unavailable. Try reloading the page.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function StatusStrip({ state }: { state: TalentSiteDashboardState }) {
  const site = state.site;
  if (!site) return null;
  const statusLabel =
    site.status === "published"
      ? "Published"
      : site.status === "unpublished"
        ? "Unpublished"
        : "Draft";
  const statusTone =
    site.status === "published"
      ? { fg: COLORS.successDeep, bg: COLORS.successSoft }
      : site.status === "unpublished"
        ? { fg: COLORS.amberDeep, bg: COLORS.amberSoft }
        : { fg: COLORS.indigoDeep, bg: COLORS.indigoSoft };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
        padding: "12px 14px",
        background: COLORS.surfaceAlt,
        borderRadius: 10,
        fontFamily: FONTS.body,
      }}
    >
      <StatusField
        label="Status"
        value={
          <span
            style={{
              padding: "2px 8px",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: statusTone.fg,
              background: statusTone.bg,
              borderRadius: 999,
            }}
          >
            {statusLabel}
          </span>
        }
      />
      <StatusField label="Draft updated" value={formatWhen(site.draftUpdatedAt)} />
      {site.publishedAt ? (
        <StatusField label="Last published" value={formatWhen(site.publishedAt)} />
      ) : null}
      <StatusField label="Version" value={`v${site.version}`} />
    </div>
  );
}

function StatusField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, color: COLORS.ink }}>{value}</div>
    </div>
  );
}

function PreviewLinks({ state }: { state: TalentSiteDashboardState }) {
  const items: { href: string; label: string }[] = [];
  if (state.publicSiteUrl && state.site?.hasPublishedSnapshot) {
    items.push({ href: state.publicSiteUrl, label: "View published site" });
  }
  if (state.profileCode) {
    items.push({ href: `/t/${state.profileCode}?preview=draft`, label: "Preview draft (owner)" });
  }
  if (state.publicProfileUrl) {
    items.push({ href: state.publicProfileUrl, label: "Standard profile" });
  }
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 600,
            background: "#fff",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            color: COLORS.ink,
            textDecoration: "none",
            fontFamily: FONTS.body,
            whiteSpace: "nowrap",
          }}
        >
          {item.label} ↗
        </Link>
      ))}
    </div>
  );
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
