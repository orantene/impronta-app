"use client";

import * as React from "react";
import Link from "next/link";
import {
  ActivitySquare,
  ChevronRight,
  ExternalLink,
  FlaskConical,
  Gauge,
  KeyRound,
  ScrollText,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Wand2,
} from "lucide-react";

import {
  ToggleSettingTableRow,
} from "@/app/(dashboard)/admin/settings/settings-forms";
import { AiProviderRegistryPanel } from "@/app/(dashboard)/admin/ai-workspace/ai-provider-registry-panel";
import { AiSetupHelpPopover } from "@/app/(dashboard)/admin/ai-workspace/ai-setup-help-popover";
import { AiUsageControlsForm } from "@/app/(dashboard)/admin/ai-workspace/ai-usage-controls-form";
import { DashboardEditPanel } from "@/components/dashboard/dashboard-edit-panel";
import {
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_TH,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────────────
 * Phase 17 — AI workspace consolidation.
 *
 * Replaces the two-page pattern (`/admin/ai-workspace` index + `/settings`
 * sub-page) with a single capability index. Every config card opens a
 * drawer using the canonical `DashboardEditPanel` chrome — the existing
 * forms (registry panel, usage controls, toggle table rows) are rendered
 * inside the drawer unchanged. Diagnostic surfaces (Console, Logs, Match
 * preview) stay as deep-link cards because they're rich, full-screen
 * pages where a drawer would feel cramped.
 * ──────────────────────────────────────────────────────────────────── */

type ToggleSpec = { key: string; label: string; description?: string };

type Flags = {
  ai_master_enabled: boolean;
  ai_search_enabled: boolean;
  ai_search_quality_v2: boolean;
  ai_rerank_enabled: boolean;
  ai_explanations_enabled: boolean;
  ai_explanations_v2: boolean;
  ai_refine_enabled: boolean;
  ai_refine_v2: boolean;
  ai_draft_enabled: boolean;
};

type RegistryRow = {
  id: string;
  kind: "none" | "openai" | "anthropic" | "custom";
  label: string;
  is_default: boolean;
  disabled: boolean;
  sort_order: number;
  credential_source: "platform" | "agency" | "inherit";
  credential_ui_state: string;
  credential_masked_hint: string | null;
};

type TenantControls = {
  credential_mode: "platform" | "agency" | "inherit";
  monthly_spend_cap_cents: number | null;
  warn_threshold_percent: number | null;
  hard_stop_on_cap: boolean;
  max_requests_per_minute: number | null;
  max_requests_per_month: number | null;
  provider_unavailable_behavior: "graceful" | "strict";
};

type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type DrawerKey =
  | "features"
  | "quality"
  | "provider"
  | "usage"
  | "audit"
  | "diagnostics";

type CardSpec = {
  key: DrawerKey | "console" | "logs" | "match";
  icon: typeof Sparkles;
  title: string;
  blurb: string;
  /** When set, the card opens a drawer; otherwise href is used. */
  drawer?: DrawerKey;
  href?: string;
  /** Right-side small status (e.g. "On / 5 enabled"). */
  status?: string;
  /** When true, dim the status (everything master-gated). */
  masterGated?: boolean;
};

export type AiWorkspaceShellProps = {
  flags: Flags;
  availabilityToggles: ToggleSpec[];
  qualityToggles: ToggleSpec[];
  settingsMap: Record<string, string>;
  registryRows: RegistryRow[];
  tenantControls: TenantControls;
  auditRows: AuditRow[];
  encryptionReady: boolean;
  envOverride: string | null;
  chatKind: "none" | "openai" | "anthropic" | "custom";
  openaiPath: boolean;
  anthropicPath: boolean;
  embedCount: number | null;
  openaiChatModel: string;
  anthropicChatModel: string;
  embedModelId: string;
  tuning: {
    aiProviderEnvOverride: string;
    improntaRrfClassicWeight: string | number;
    improntaRrfVectorWeight: string | number;
    improntaEmbedCacheGen: string | number;
    improntaVectorNeighborCacheTtlMs: string | number;
    improntaVectorNeighborCacheMax: string | number;
    improntaRefineCacheTtlMs: string | number;
  };
  /** Number of saved-on availability toggles, computed server-side. */
  availabilityOnCount: number;
};

export function AiWorkspaceShell(props: AiWorkspaceShellProps) {
  const [open, setOpen] = React.useState<DrawerKey | null>(null);
  const close = React.useCallback(() => setOpen(null), []);
  const masterEnabled = props.flags.ai_master_enabled;

  const providerLabel =
    props.chatKind === "anthropic"
      ? "Anthropic"
      : props.chatKind === "openai"
        ? "OpenAI"
        : props.chatKind === "custom"
          ? "Custom (not available)"
          : "None";

  const cards: CardSpec[] = [
    {
      key: "features",
      icon: Sliders,
      title: "Feature switches",
      blurb:
        "Search, rerank, explanations, refine chips, inquiry drafting, translations, embeddings.",
      drawer: "features",
      status: `${props.availabilityOnCount} of ${props.availabilityToggles.length} on`,
      masterGated: !masterEnabled,
    },
    {
      key: "quality",
      icon: Wand2,
      title: "Quality refinements",
      blurb: "v2 ranking + refine chips + richer match explanations.",
      drawer: "quality",
      status:
        [
          props.flags.ai_search_quality_v2 && "search v2",
          props.flags.ai_refine_v2 && "refine v2",
          props.flags.ai_explanations_v2 && "expl v2",
        ]
          .filter(Boolean)
          .join(" · ") || "off",
      masterGated: !masterEnabled,
    },
    {
      key: "provider",
      icon: KeyRound,
      title: "Provider configuration",
      blurb:
        "Default provider, credential source, encrypted keys. Keys stay server-side.",
      drawer: "provider",
      status: providerLabel,
    },
    {
      key: "usage",
      icon: Gauge,
      title: "Usage controls",
      blurb: "Spend cap, throttling, behavior when provider is unavailable.",
      drawer: "usage",
      status:
        props.tenantControls.monthly_spend_cap_cents == null
          ? "no cap"
          : `cap $${(props.tenantControls.monthly_spend_cap_cents / 100).toFixed(0)}/mo`,
    },
    {
      key: "audit",
      icon: ShieldCheck,
      title: "Provider audit log",
      blurb: "Recent provider + tenant-control changes.",
      drawer: "audit",
      status: `${props.auditRows.length} entries`,
    },
    {
      key: "diagnostics",
      icon: ActivitySquare,
      title: "Diagnostics",
      blurb:
        "Embedding model, indexed-profile count, runtime tuning overrides.",
      drawer: "diagnostics",
      status:
        props.embedCount == null
          ? "—"
          : `${props.embedCount} indexed`,
    },
    {
      key: "console",
      icon: Search,
      title: "AI Console",
      blurb: "Search metrics, recent queries, mode breakdowns.",
      href: "/admin/ai-workspace/console",
    },
    {
      key: "logs",
      icon: ScrollText,
      title: "Search logs",
      blurb: "Per-query activity log with filters.",
      href: "/admin/ai-workspace/logs",
    },
    {
      key: "match",
      icon: FlaskConical,
      title: "Match preview",
      blurb: "Try a search and inspect ranking before going live.",
      href: "/admin/ai-workspace/match-preview",
    },
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <CapabilityCard
            key={c.key}
            spec={c}
            onOpen={() => c.drawer && setOpen(c.drawer)}
          />
        ))}
      </div>

      {/* Drawers */}
      <DashboardEditPanel
        open={open === "features"}
        onOpenChange={(o) => (o ? setOpen("features") : close())}
        title="Feature switches"
        description="Guest-facing and admin AI features. Master AI must be on for any of these to take effect."
      >
        <div className="overflow-hidden rounded-xl border border-border/50 bg-card/25 shadow-sm">
          <table className="w-full text-sm">
            <thead className={ADMIN_TABLE_HEAD}>
              <tr className="border-b border-border/45 text-left">
                <th className={ADMIN_TABLE_TH}>Feature</th>
                <th className={cn(ADMIN_TABLE_TH, "w-[10rem] text-right")}>
                  Enabled
                </th>
              </tr>
            </thead>
            <tbody>
              {props.availabilityToggles.map((s) => (
                <ToggleSettingTableRow
                  key={s.key}
                  settingKey={s.key}
                  currentValue={props.settingsMap[s.key] ?? "false"}
                  label={s.label}
                  description={s.description}
                />
              ))}
            </tbody>
          </table>
        </div>
      </DashboardEditPanel>

      <DashboardEditPanel
        open={open === "quality"}
        onOpenChange={(o) => (o ? setOpen("quality") : close())}
        title="Quality refinements"
        description="Incremental upgrades to merge, refine, and explanation quality."
      >
        <div className="overflow-hidden rounded-xl border border-border/50 bg-card/25 shadow-sm">
          <table className="w-full text-sm">
            <thead className={ADMIN_TABLE_HEAD}>
              <tr className="border-b border-border/45 text-left">
                <th className={ADMIN_TABLE_TH}>Feature</th>
                <th className={cn(ADMIN_TABLE_TH, "w-[10rem] text-right")}>
                  Enabled
                </th>
              </tr>
            </thead>
            <tbody>
              {props.qualityToggles.map((s) => (
                <ToggleSettingTableRow
                  key={s.key}
                  settingKey={s.key}
                  currentValue={props.settingsMap[s.key] ?? "false"}
                  label={s.label}
                  description={s.description}
                />
              ))}
            </tbody>
          </table>
        </div>
      </DashboardEditPanel>

      <DashboardEditPanel
        open={open === "provider"}
        onOpenChange={(o) => (o ? setOpen("provider") : close())}
        title="Provider configuration"
        titleExtra={<AiSetupHelpPopover />}
        description="Runtime provider registry and encrypted keys. Keys are stored server-side only; the UI never receives raw secrets after save."
      >
        {props.envOverride ? (
          <p className="mb-4 rounded-md border border-foreground/35 border-l-[3px] border-l-foreground bg-foreground/[0.05] px-3 py-2 text-sm text-foreground">
            <strong>AI_PROVIDER</strong> is set in the host environment to{" "}
            <code className="font-mono">{props.envOverride}</code> — this
            overrides the dashboard default for chat completions.
          </p>
        ) : null}
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-sm">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Default chat provider
            </p>
            <p className="mt-1 font-medium text-foreground">{providerLabel}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-sm">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Key paths (resolved server-side)
            </p>
            <p className="mt-1 text-foreground">
              OpenAI: {props.openaiPath ? "available" : "not available"}
            </p>
            <p className="mt-1 text-foreground">
              Anthropic: {props.anthropicPath ? "available" : "not available"}
            </p>
          </div>
        </div>
        <AiProviderRegistryPanel
          instances={props.registryRows}
          encryptionReady={props.encryptionReady}
          tenantCredentialMode={props.tenantControls.credential_mode}
        />
      </DashboardEditPanel>

      <DashboardEditPanel
        open={open === "usage"}
        onOpenChange={(o) => (o ? setOpen("usage") : close())}
        title="Usage controls"
        description="Cost guardrails and throttling. Separate from product availability and provider keys."
      >
        <AiUsageControlsForm initial={props.tenantControls} />
      </DashboardEditPanel>

      <DashboardEditPanel
        open={open === "audit"}
        onOpenChange={(o) => (o ? setOpen("audit") : close())}
        title="Provider audit log"
        description="Recent changes to providers and tenant controls."
      >
        {props.auditRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audit entries yet.</p>
        ) : (
          <ul className="space-y-2 font-mono text-xs">
            {props.auditRows.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-border/40 bg-muted/10 px-2 py-1.5 text-muted-foreground"
              >
                <span className="text-foreground">{r.created_at}</span> —{" "}
                {r.action}{" "}
                <span className="text-foreground">{r.entity_type}</span>
              </li>
            ))}
          </ul>
        )}
      </DashboardEditPanel>

      <DashboardEditPanel
        open={open === "diagnostics"}
        onOpenChange={(o) => (o ? setOpen("diagnostics") : close())}
        title="Diagnostics"
        description="Embedding model, indexed-profile count, and host-environment runtime tuning."
      >
        <div className="space-y-5 text-sm">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Embeddings
            </h3>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li>
                Model:{" "}
                <code className="text-foreground">{props.embedModelId}</code>
              </li>
              <li>
                Indexed profiles:{" "}
                <span className="font-mono text-foreground">
                  {props.embedCount === null ? "—" : props.embedCount}
                </span>
              </li>
              <li>In-memory embed cache: 12 min TTL, max 400 entries.</li>
            </ul>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Chat models (host environment)
            </h3>
            <dl className="mt-2 grid gap-2 font-mono text-xs sm:grid-cols-2">
              <div className="rounded-md border border-border/50 bg-muted/15 px-3 py-2">
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  OPENAI_CHAT_MODEL
                </dt>
                <dd className="mt-1 text-foreground">
                  {props.openaiChatModel}
                </dd>
              </div>
              <div className="rounded-md border border-border/50 bg-muted/15 px-3 py-2">
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  ANTHROPIC_CHAT_MODEL
                </dt>
                <dd className="mt-1 text-foreground">
                  {props.anthropicChatModel}
                </dd>
              </div>
            </dl>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Runtime tuning (read-only)
            </h3>
            <dl className="mt-2 grid gap-2 font-mono text-xs sm:grid-cols-2">
              {(
                [
                  ["AI_PROVIDER override", props.tuning.aiProviderEnvOverride],
                  [
                    "IMPRONTA_RRF_CLASSIC_WEIGHT",
                    props.tuning.improntaRrfClassicWeight,
                  ],
                  [
                    "IMPRONTA_RRF_VECTOR_WEIGHT",
                    props.tuning.improntaRrfVectorWeight,
                  ],
                  [
                    "IMPRONTA_EMBED_CACHE_GEN",
                    props.tuning.improntaEmbedCacheGen,
                  ],
                  [
                    "IMPRONTA_VECTOR_NEIGHBOR_CACHE_TTL_MS",
                    props.tuning.improntaVectorNeighborCacheTtlMs,
                  ],
                  [
                    "IMPRONTA_VECTOR_NEIGHBOR_CACHE_MAX",
                    props.tuning.improntaVectorNeighborCacheMax,
                  ],
                  [
                    "IMPRONTA_REFINE_CACHE_TTL_MS",
                    props.tuning.improntaRefineCacheTtlMs,
                  ],
                ] as const
              ).map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-md border border-border/50 bg-muted/15 px-3 py-2"
                >
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {k}
                  </dt>
                  <dd className="mt-1 text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </DashboardEditPanel>
    </>
  );
}

function CapabilityCard({
  spec,
  onOpen,
}: {
  spec: CardSpec;
  onOpen: () => void;
}) {
  const Icon = spec.icon;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl border border-border/60 bg-muted/30 text-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        {spec.href ? (
          <ExternalLink
            className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        ) : (
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        )}
      </div>
      <div className="mt-3 space-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {spec.title}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {spec.blurb}
        </p>
      </div>
      {spec.status ? (
        <p
          className={cn(
            "mt-3 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            spec.masterGated
              ? "border-border/50 bg-muted/30 text-muted-foreground"
              : "border-foreground/40 bg-foreground/[0.06] text-foreground",
          )}
        >
          {spec.status}
        </p>
      ) : null}
    </>
  );

  const baseClass =
    "group flex flex-col rounded-2xl border border-border/60 bg-card/40 p-4 text-left shadow-sm transition-[border-color,background-color,box-shadow] duration-200 hover:border-foreground/40 hover:bg-foreground/[0.02] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  if (spec.href) {
    return (
      <Link href={spec.href} scroll={false} className={baseClass}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onOpen} className={baseClass}>
      {inner}
    </button>
  );
}
