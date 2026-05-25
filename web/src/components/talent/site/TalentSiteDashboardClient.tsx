"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { createTalentPersonalSiteDraftAction } from "@/lib/talent-site/server/actions";
import type { TalentSiteDashboardState } from "@/lib/talent-site/types";
import { TalentSiteEditorForm } from "./TalentSiteEditorForm";
import { TalentSiteLockedCard } from "./TalentSiteLockedCard";

const FONT = '"Inter", system-ui, sans-serif';

type Props = {
  tenantSlug: string;
  initialState: TalentSiteDashboardState;
};

export function TalentSiteDashboardClient({ tenantSlug, initialState }: Props) {
  const router = useRouter();
  const { openDrawer } = useAdminShell();
  const [state, setState] = useState(initialState);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const locked = !state.canBuildPersonalSite;
  const hasSite = state.site != null;
  const draftSnapshot = state.site?.draftSnapshot;

  function refresh() {
    router.refresh();
  }

  function handleCreate() {
    startTransition(async () => {
      setError(null);
      const result = await createTalentPersonalSiteDraftAction(tenantSlug);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      refresh();
    });
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px", fontFamily: FONT }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>My personal site</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "rgba(11,11,13,0.55)" }}>
          Your owned Tulala page at{" "}
          {state.publicSiteUrl ? (
            <Link href={state.publicSiteUrl} target="_blank" rel="noopener noreferrer">
              {state.publicSiteUrl}
            </Link>
          ) : (
            "— set a profile code first"
          )}
          . Separate from agency roster pages.
        </p>
      </header>

      {locked ? (
        <TalentSiteLockedCard state={state} onUpgrade={() => openDrawer("talent-tier-compare")} />
      ) : !hasSite ? (
        <section
          style={{
            background: "#fff",
            border: "1px solid rgba(24,24,27,0.08)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Create your personal site</h2>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "rgba(11,11,13,0.55)" }}>
            We&apos;ll generate a starter layout from your public profile — hero, about, gallery,
            and contact CTA. You can edit copy and publish when ready.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={handleCreate}
            style={{
              background: "#0B0B0D",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: pending ? "wait" : "pointer",
            }}
          >
            {pending ? "Creating…" : "Create your personal site"}
          </button>
          {error ? <p style={{ marginTop: 12, fontSize: 13, color: "#b91c1c" }}>{error}</p> : null}
        </section>
      ) : (
        <>
          <StatusStrip state={state} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {state.publicSiteUrl && state.site?.hasPublishedSnapshot ? (
              <Link
                href={state.publicSiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={linkBtnStyle()}
              >
                View published site
              </Link>
            ) : null}
            {state.profileCode ? (
              <Link
                href={`/t/${state.profileCode}/site?preview=draft`}
                target="_blank"
                rel="noopener noreferrer"
                style={linkBtnStyle()}
              >
                Preview draft (owner)
              </Link>
            ) : null}
            {state.publicProfileUrl ? (
              <Link href={state.publicProfileUrl} target="_blank" rel="noopener noreferrer" style={linkBtnStyle()}>
                Standard profile
              </Link>
            ) : null}
          </div>
          {draftSnapshot ? (
            <TalentSiteEditorForm
              tenantSlug={tenantSlug}
              state={state}
              initialSnapshot={draftSnapshot}
              onSaved={refresh}
            />
          ) : (
            <p style={{ fontSize: 13, color: "rgba(11,11,13,0.55)" }}>
              Draft snapshot unavailable. Try reloading the page.
            </p>
          )}
        </>
      )}
    </div>
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

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        marginBottom: 16,
        padding: "12px 14px",
        background: "rgba(11,11,13,0.03)",
        borderRadius: 10,
        fontSize: 12,
      }}
    >
      <span>
        <strong>Status:</strong> {statusLabel}
      </span>
      <span>
        <strong>Draft updated:</strong> {formatWhen(site.draftUpdatedAt)}
      </span>
      {site.publishedAt ? (
        <span>
          <strong>Last published:</strong> {formatWhen(site.publishedAt)}
        </span>
      ) : null}
      <span>
        <strong>Version:</strong> {site.version}
      </span>
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

function linkBtnStyle() {
  return {
    display: "inline-block",
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid rgba(24,24,27,0.12)",
    borderRadius: 8,
    textDecoration: "none",
    color: "#0B0B0D",
  } as const;
}
