"use client";

import { PLAN_CATALOG, type PlanKey } from "@/lib/access/plan-catalog";
import { PLAN_LIMITS } from "@/lib/access/plan-limits";

/**
 * F.14 — Plan compare drawer content.
 *
 * Side-by-side feature matrix for workspace plans. Drives the
 * upgrade-modal "Compare plans" CTA and the settings "What's in each
 * tier?" link. Strictly read-only — selection / purchase live in the
 * existing upgrade-modal flow.
 *
 * Feature rows are explicit (no implicit inference from plan_capabilities)
 * so the marketing copy can disagree with the runtime gate when needed.
 */

type WorkspacePlanKey = "free" | "studio" | "agency" | "network";
const WORKSPACE_PLANS: WorkspacePlanKey[] = ["free", "studio", "agency", "network"];

type Cell = boolean | string;

type FeatureRow = {
  /** Section header — groups related rows visually. */
  section: string;
  /** Display label for the row. */
  label: string;
  /** Optional hover-hint copy. */
  hint?: string;
  cells: Record<WorkspacePlanKey, Cell>;
};

/**
 * Team-seat cell copy, read from the canonical ladder in `plan-limits.ts`.
 * `null` there means unlimited (Agency, Network) — never render "null".
 */
function teamSeatCell(plan: WorkspacePlanKey): string {
  const seats = PLAN_LIMITS[plan].max_team_seats;
  return seats == null ? "Unlimited" : String(seats);
}

const FEATURE_MATRIX: FeatureRow[] = [
  // ── Core
  {
    section: "Core",
    label: "Manage your roster",
    cells: { free: true, studio: true, agency: true, network: true },
  },
  {
    section: "Core",
    label: "Receive client inquiries",
    cells: { free: true, studio: true, agency: true, network: true },
  },
  {
    section: "Core",
    label: "In-app messaging + offers",
    cells: { free: true, studio: true, agency: true, network: true },
  },
  // ── Team
  {
    section: "Team",
    label: "Team seats",
    cells: {
      free: teamSeatCell("free"),
      studio: teamSeatCell("studio"),
      agency: teamSeatCell("agency"),
      network: teamSeatCell("network"),
    },
  },
  {
    section: "Team",
    label: "Roles + permissions",
    hint: "Owner / Admin / Coordinator / Editor / Viewer",
    cells: { free: false, studio: true, agency: true, network: true },
  },
  {
    section: "Team",
    label: "Auto-coordinator",
    hint: "Pick which member is auto-assigned on new inquiries.",
    cells: { free: false, studio: false, agency: true, network: true },
  },
  // ── Site
  {
    section: "Public site",
    label: "Public storefront",
    cells: { free: false, studio: true, agency: true, network: true },
  },
  {
    section: "Public site",
    label: "Custom domain",
    cells: { free: false, studio: false, agency: true, network: true },
  },
  {
    section: "Public site",
    label: "Pages, posts, navigation",
    cells: { free: false, studio: false, agency: true, network: true },
  },
  {
    section: "Public site",
    label: "Brand kit + theme editor",
    cells: { free: false, studio: false, agency: true, network: true },
  },
  // ── Booking ops
  {
    section: "Booking ops",
    label: "Bookings + scheduling",
    cells: { free: true, studio: true, agency: true, network: true },
  },
  {
    section: "Booking ops",
    label: "Pitches (curated talent suggestions)",
    cells: { free: false, studio: true, agency: true, network: true },
  },
  {
    section: "Booking ops",
    label: "Media library + watermarks",
    cells: { free: false, studio: "Watermark", agency: true, network: true },
  },
  // ── Insights
  {
    section: "Insights",
    label: "Storefront analytics",
    cells: { free: false, studio: "Basic", agency: true, network: true },
  },
  {
    section: "Insights",
    label: "Advanced analytics + exports",
    cells: { free: false, studio: false, agency: false, network: true },
  },
  // ── Integrations
  {
    section: "Integrations",
    label: "Widgets + API access",
    cells: { free: false, studio: true, agency: true, network: true },
  },
  {
    section: "Integrations",
    label: "Webhooks",
    cells: { free: false, studio: false, agency: true, network: true },
  },
  // ── Support
  {
    section: "Support",
    label: "Support tier",
    cells: { free: "Standard", studio: "Standard", agency: "Priority", network: "Enterprise" },
  },
];

const SECTIONS = Array.from(new Set(FEATURE_MATRIX.map((r) => r.section)));

function priceLabel(planKey: WorkspacePlanKey): string {
  const def = PLAN_CATALOG[planKey];
  if (def.monthlyPriceCents === 0) return "Free";
  if (def.monthlyPriceCents === null) return "Talk to sales";
  return `$${(def.monthlyPriceCents / 100).toFixed(0)} / mo`;
}

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.38)",
  border: "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.05)",
  surface: "rgba(11,11,13,0.02)",
};

export type PlanComparisonProps = {
  /** Current tenant plan — highlighted in the header row. */
  currentPlan?: WorkspacePlanKey | null;
  /** Click on a plan column header. Optional — pass to wire upgrade CTA. */
  onSelectPlan?: (plan: WorkspacePlanKey) => void;
};

export function PlanComparison({ currentPlan, onSelectPlan }: PlanComparisonProps) {
  return (
    <div style={{ fontFamily: '"Inter", system-ui, sans-serif', color: C.ink }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(180px, 1.4fr) repeat(4, minmax(110px, 1fr))",
          gap: 0,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        {/* Header row */}
        <div style={{ padding: "12px 14px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.inkDim, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Workspace plans
          </div>
        </div>
        {WORKSPACE_PLANS.map((plan) => {
          const def = PLAN_CATALOG[plan];
          const isCurrent = currentPlan === plan;
          return (
            <div
              key={plan}
              role={onSelectPlan ? "button" : undefined}
              tabIndex={onSelectPlan ? 0 : undefined}
              onClick={onSelectPlan ? () => onSelectPlan(plan) : undefined}
              style={{
                padding: "12px 12px",
                background: isCurrent ? "rgba(15,79,62,0.05)" : C.surface,
                borderBottom: `1px solid ${C.border}`,
                borderLeft: `1px solid ${C.border}`,
                cursor: onSelectPlan ? "pointer" : "default",
                position: "relative",
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
                {def.displayName}
              </div>
              <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>{priceLabel(plan)}</div>
              {isCurrent ? (
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    fontSize: 9,
                    fontWeight: 700,
                    color: "#093328",
                    background: "rgba(15,79,62,0.10)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                  }}
                >
                  Current
                </div>
              ) : null}
            </div>
          );
        })}

        {/* Feature rows grouped by section */}
        {SECTIONS.map((section) => (
          <SectionRows key={section} section={section} />
        ))}
      </div>
    </div>
  );
}

function SectionRows({ section }: { section: string }) {
  const rows = FEATURE_MATRIX.filter((r) => r.section === section);
  return (
    <>
      <div
        style={{
          gridColumn: "1 / -1",
          padding: "10px 14px 4px",
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          color: C.inkMuted,
          textTransform: "uppercase",
          borderTop: `1px solid ${C.border}`,
          background: "#fafafa",
        }}
      >
        {section}
      </div>
      {rows.map((row, idx) => (
        <FeatureRowView key={`${row.label}-${idx}`} row={row} />
      ))}
    </>
  );
}

function FeatureRowView({ row }: { row: FeatureRow }) {
  return (
    <>
      <div
        style={{
          padding: "10px 14px",
          fontSize: 13,
          color: C.ink,
          borderTop: `1px solid ${C.borderSoft}`,
        }}
      >
        {row.label}
        {row.hint ? (
          <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 2 }}>{row.hint}</div>
        ) : null}
      </div>
      {WORKSPACE_PLANS.map((plan) => (
        <div
          key={plan}
          style={{
            padding: "10px 12px",
            fontSize: 13,
            color: C.ink,
            borderTop: `1px solid ${C.borderSoft}`,
            borderLeft: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <CellView value={row.cells[plan]} />
        </div>
      ))}
    </>
  );
}

function CellView({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <span aria-label="Included" style={{ color: "#15803D", fontSize: 16, lineHeight: 1, fontWeight: 700 }}>
        ✓
      </span>
    );
  }
  if (value === false) {
    return (
      <span aria-label="Not included" style={{ color: C.inkDim, fontSize: 14, lineHeight: 1 }}>
        —
      </span>
    );
  }
  return <span style={{ fontSize: 12, color: C.ink }}>{value}</span>;
}
