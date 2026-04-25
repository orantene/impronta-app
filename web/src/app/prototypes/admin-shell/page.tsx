"use client";

/**
 * Phase 1 — Workspace admin shell mocks.
 *
 * Validates: shell rhythm, card hierarchy, locked-card language,
 * free vs paid plan visibility, card-system consistency across all six pages.
 *
 * No drawers. No backend. No real navigation. Click a scene chip in the
 * picker bar to swap the rendered scene via full-page nav (?p=...&plan=...&role=...&mode=...).
 *
 * 18 scenes:
 *   12 base scenes  : 6 pages × {free, agency} for owner.
 *   3 role variants : Site rendered for admin / coordinator / editor.
 *   1 viewer scene  : Overview rendered for viewer on Agency.
 *   2 persona states: Workspace Free starter, Site Free upsell.
 *
 * Scope rule: workspace shell only. No platform/HQ behavior. The slug
 * shown in chrome is hard-coded `acme-models` to keep the prototype
 * self-contained.
 */

import { useSearchParams } from "next/navigation";
import {
  Activity,
  AlertCircle,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  CreditCard,
  Database,
  Eye,
  FileEdit,
  FileText,
  Filter,
  Globe,
  Image as ImageIcon,
  KeyRound,
  Languages,
  Layers,
  Lock,
  MapPin,
  Network,
  Palette,
  Plus,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  Tag,
  Users,
  UserPlus,
  Workflow,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

// ─── Tokens ──────────────────────────────────────────────────────────

const DISPLAY_FONT = '"Cormorant Garamond", "EB Garamond", Georgia, serif';
const BODY_FONT = '"Inter", system-ui, sans-serif';

const COLORS = {
  surface: "#FAFAF7",
  card: "#FFFFFF",
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  inkDim: "rgba(11,11,13,0.38)",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  cream: "#F5F2EB",
  gold: "#B8860B",
  green: "#2E7D5B",
  amber: "#C68A1E",
  red: "#B0303A",
  navyBg: "#0B0B0D",
};

// ─── Tenant + plan + role + scene types ──────────────────────────────

const TENANT_SLUG = "acme-models";
const TENANT_NAME = "Acme Models";

const PLANS = ["free", "studio", "agency", "network"] as const;
type Plan = (typeof PLANS)[number];

const PLAN_LABELS: Record<Plan, string> = {
  free: "Free",
  studio: "Studio",
  agency: "Agency",
  network: "Network",
};

const PLAN_RANK: Record<Plan, number> = {
  free: 0,
  studio: 1,
  agency: 2,
  network: 3,
};

function meetsPlan(current: Plan, required: Plan): boolean {
  return PLAN_RANK[current] >= PLAN_RANK[required];
}

const ROLES = ["owner", "admin", "coordinator", "editor", "viewer"] as const;
type Role = (typeof ROLES)[number];

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  coordinator: "Coordinator",
  editor: "Editor",
  viewer: "Viewer",
};

const PAGES = [
  { id: "overview", label: "Overview" },
  { id: "work", label: "Work" },
  { id: "talent", label: "Talent" },
  { id: "clients", label: "Clients" },
  { id: "site", label: "Site" },
  { id: "workspace", label: "Workspace" },
] as const;

type PageId = (typeof PAGES)[number]["id"];

type Mode = "default" | "starter" | "upsell";

// ─── Scene catalog ───────────────────────────────────────────────────

type Scene = {
  id: string;
  label: string;
  group: "Core (Free vs Agency)" | "Role variants" | "Persona states";
  page: PageId;
  plan: Plan;
  role: Role;
  mode: Mode;
};

const SCENES: Scene[] = [
  // Core
  { id: "overview-free", label: "Overview · Free", group: "Core (Free vs Agency)", page: "overview", plan: "free", role: "owner", mode: "default" },
  { id: "overview-agency", label: "Overview · Agency", group: "Core (Free vs Agency)", page: "overview", plan: "agency", role: "owner", mode: "default" },
  { id: "work-free", label: "Work · Free", group: "Core (Free vs Agency)", page: "work", plan: "free", role: "owner", mode: "default" },
  { id: "work-agency", label: "Work · Agency", group: "Core (Free vs Agency)", page: "work", plan: "agency", role: "owner", mode: "default" },
  { id: "talent-free", label: "Talent · Free", group: "Core (Free vs Agency)", page: "talent", plan: "free", role: "owner", mode: "default" },
  { id: "talent-agency", label: "Talent · Agency", group: "Core (Free vs Agency)", page: "talent", plan: "agency", role: "owner", mode: "default" },
  { id: "clients-free", label: "Clients · Free", group: "Core (Free vs Agency)", page: "clients", plan: "free", role: "owner", mode: "default" },
  { id: "clients-agency", label: "Clients · Agency", group: "Core (Free vs Agency)", page: "clients", plan: "agency", role: "owner", mode: "default" },
  { id: "site-free", label: "Site · Free", group: "Core (Free vs Agency)", page: "site", plan: "free", role: "owner", mode: "default" },
  { id: "site-agency", label: "Site · Agency", group: "Core (Free vs Agency)", page: "site", plan: "agency", role: "owner", mode: "default" },
  { id: "workspace-free", label: "Workspace · Free", group: "Core (Free vs Agency)", page: "workspace", plan: "free", role: "owner", mode: "default" },
  { id: "workspace-agency", label: "Workspace · Agency", group: "Core (Free vs Agency)", page: "workspace", plan: "agency", role: "owner", mode: "default" },
  // Role variants
  { id: "site-admin", label: "Site · Admin", group: "Role variants", page: "site", plan: "agency", role: "admin", mode: "default" },
  { id: "site-coordinator", label: "Site · Coordinator", group: "Role variants", page: "site", plan: "agency", role: "coordinator", mode: "default" },
  { id: "site-editor", label: "Site · Editor", group: "Role variants", page: "site", plan: "agency", role: "editor", mode: "default" },
  { id: "overview-viewer", label: "Overview · Viewer", group: "Role variants", page: "overview", plan: "agency", role: "viewer", mode: "default" },
  // Persona states
  { id: "workspace-starter", label: "Workspace · Free Starter", group: "Persona states", page: "workspace", plan: "free", role: "owner", mode: "starter" },
  { id: "site-upsell", label: "Site · Free Upsell", group: "Persona states", page: "site", plan: "free", role: "owner", mode: "upsell" },
];

const DEFAULT_SCENE = SCENES[0];

function findScene(params: URLSearchParams): Scene {
  const page = params.get("p") ?? DEFAULT_SCENE.page;
  const plan = (params.get("plan") ?? DEFAULT_SCENE.plan) as Plan;
  const role = (params.get("role") ?? DEFAULT_SCENE.role) as Role;
  const mode = (params.get("mode") ?? DEFAULT_SCENE.mode) as Mode;
  // Try exact match first; fall back to page+plan if role/mode not configured.
  const exact = SCENES.find(
    (s) => s.page === page && s.plan === plan && s.role === role && s.mode === mode,
  );
  if (exact) return exact;
  const fallback = SCENES.find((s) => s.page === page && s.plan === plan);
  return fallback ?? DEFAULT_SCENE;
}

function sceneHref(scene: Scene): string {
  const u = new URLSearchParams();
  u.set("p", scene.page);
  u.set("plan", scene.plan);
  if (scene.role !== "owner") u.set("role", scene.role);
  if (scene.mode !== "default") u.set("mode", scene.mode);
  return `?${u.toString()}`;
}

// ─── Atoms ───────────────────────────────────────────────────────────

function CapsLabel({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ink" | "gold" }) {
  const color = tone === "ink" ? COLORS.ink : tone === "gold" ? COLORS.gold : COLORS.inkMuted;
  return (
    <span
      style={{
        fontFamily: BODY_FONT,
        fontSize: 10.5,
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        color,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

function IconChip({
  icon: Icon,
  size = 34,
  tone = "cream",
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  size?: number;
  tone?: "cream" | "ink" | "gold" | "muted";
}) {
  const bg =
    tone === "ink"
      ? COLORS.ink
      : tone === "gold"
      ? "rgba(184,134,11,0.10)"
      : tone === "muted"
      ? "rgba(11,11,13,0.04)"
      : COLORS.cream;
  const fg = tone === "ink" ? "#FFFFFF" : tone === "gold" ? COLORS.gold : COLORS.ink;
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: bg,
        boxShadow: `inset 0 0 0 1px ${COLORS.borderSoft}`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={1.6} color={fg} />
    </span>
  );
}

function StatDot({ tone = "ink" }: { tone?: "green" | "amber" | "red" | "ink" | "dim" }) {
  const c =
    tone === "green"
      ? COLORS.green
      : tone === "amber"
      ? COLORS.amber
      : tone === "red"
      ? COLORS.red
      : tone === "dim"
      ? COLORS.inkDim
      : COLORS.ink;
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: 999,
        background: c,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

function PlanChip({ plan, locked = false }: { plan: Plan; locked?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 9px",
        borderRadius: 999,
        fontFamily: BODY_FONT,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: locked ? COLORS.gold : COLORS.ink,
        background: locked ? "rgba(184,134,11,0.08)" : "rgba(11,11,13,0.04)",
        boxShadow: `inset 0 0 0 1px ${locked ? "rgba(184,134,11,0.22)" : COLORS.borderSoft}`,
      }}
    >
      {locked ? <Lock size={10} strokeWidth={2.2} /> : null}
      {PLAN_LABELS[plan]}
    </span>
  );
}

function ReadOnlyChip() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 7px",
        borderRadius: 999,
        fontFamily: BODY_FONT,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: COLORS.inkMuted,
        background: "rgba(11,11,13,0.035)",
        boxShadow: `inset 0 0 0 1px ${COLORS.borderSoft}`,
      }}
    >
      <Eye size={10} strokeWidth={2} />
      View only
    </span>
  );
}

// ─── Card primitives ─────────────────────────────────────────────────

type CardProps = {
  icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  title: string;
  status?: ReactNode;
  children?: ReactNode;
  affordance?: "drawer" | "upgrade" | "none";
  span?: 1 | 2;
  tone?: "default" | "danger" | "starter";
  topRight?: ReactNode;
};

function Card({
  icon: Icon,
  title,
  status,
  children,
  affordance = "drawer",
  span = 1,
  tone = "default",
  topRight,
}: CardProps) {
  const isDanger = tone === "danger";
  const isStarter = tone === "starter";
  return (
    <div
      style={{
        gridColumn: `span ${span}`,
        background: COLORS.card,
        borderRadius: 14,
        border: `1px solid ${isDanger ? "rgba(176,48,58,0.22)" : COLORS.border}`,
        padding: 18,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 132,
        boxShadow: isStarter
          ? "0 0 0 2px rgba(184,134,11,0.12), 0 1px 1px rgba(11,11,13,0.02)"
          : "0 1px 1px rgba(11,11,13,0.02)",
        cursor: affordance === "none" ? "default" : "pointer",
        transition: "transform .15s ease, box-shadow .15s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <IconChip icon={Icon} tone={isDanger ? "muted" : "cream"} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: BODY_FONT,
              fontSize: 14.5,
              fontWeight: 600,
              color: isDanger ? COLORS.red : COLORS.ink,
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
            }}
          >
            {title}
          </div>
          {status ? (
            <div
              style={{
                fontFamily: BODY_FONT,
                fontSize: 12.5,
                color: COLORS.inkMuted,
                marginTop: 4,
                lineHeight: 1.45,
              }}
            >
              {status}
            </div>
          ) : null}
        </div>
        {topRight ? (
          <div style={{ position: "absolute", top: 14, right: 14 }}>{topRight}</div>
        ) : null}
      </div>

      {children ? <div style={{ marginTop: 2 }}>{children}</div> : null}

      <div
        style={{
          marginTop: "auto",
          paddingTop: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          borderTop: `1px dashed ${COLORS.borderSoft}`,
        }}
      >
        <AffordanceLabel kind={affordance} />
        {affordance !== "none" ? (
          <AffordanceArrow kind={affordance} />
        ) : null}
      </div>
    </div>
  );
}

function AffordanceLabel({ kind }: { kind: "drawer" | "upgrade" | "none" }) {
  if (kind === "none") return <span style={{ height: 14 }} />;
  const label = kind === "drawer" ? "Opens drawer" : "Upgrade to unlock";
  const color = kind === "drawer" ? COLORS.inkDim : COLORS.gold;
  return (
    <span
      style={{
        fontFamily: BODY_FONT,
        fontSize: 11,
        fontWeight: 500,
        color,
        letterSpacing: "0.01em",
      }}
    >
      {label}
      <span style={{ color: COLORS.inkDim, marginLeft: 6, fontSize: 10 }}>
        {kind === "drawer" ? "(Phase 2)" : "(Phase 3)"}
      </span>
    </span>
  );
}

function AffordanceArrow({ kind }: { kind: "drawer" | "upgrade" }) {
  return (
    <ChevronRight
      size={14}
      strokeWidth={2}
      color={kind === "drawer" ? COLORS.inkDim : COLORS.gold}
    />
  );
}

// Sub-card content blocks (used inside Card>children)

function StatRow({ items }: { items: { label: string; value: string; tone?: "ink" | "green" | "amber" | "red" | "dim" }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 10 }}>
      {items.map((it) => (
        <div key={it.label}>
          <div
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize: 22,
              lineHeight: 1.1,
              color:
                it.tone === "green"
                  ? COLORS.green
                  : it.tone === "amber"
                  ? COLORS.amber
                  : it.tone === "red"
                  ? COLORS.red
                  : it.tone === "dim"
                  ? COLORS.inkDim
                  : COLORS.ink,
              fontWeight: 500,
            }}
          >
            {it.value}
          </div>
          <div
            style={{
              fontFamily: BODY_FONT,
              fontSize: 10.5,
              color: COLORS.inkMuted,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              marginTop: 2,
              fontWeight: 500,
            }}
          >
            {it.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function Bullet({ tone, children }: { tone?: "green" | "amber" | "red" | "ink" | "dim"; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: BODY_FONT,
        fontSize: 12.5,
        color: COLORS.ink,
        lineHeight: 1.45,
        padding: "3px 0",
      }}
    >
      <StatDot tone={tone} />
      <span>{children}</span>
    </div>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: BODY_FONT,
        fontSize: 12.5,
        color: COLORS.inkDim,
        fontStyle: "italic",
        padding: "4px 0",
      }}
    >
      {children}
    </div>
  );
}

// ─── Locked card ─────────────────────────────────────────────────────

function LockedCard({
  icon,
  title,
  blurb,
  requiredPlan,
  span = 1,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  title: string;
  blurb: string;
  requiredPlan: Plan;
  span?: 1 | 2;
}) {
  return (
    <div
      style={{
        gridColumn: `span ${span}`,
        background: "linear-gradient(180deg, #FFFDFA 0%, #FAF5EC 100%)",
        borderRadius: 14,
        border: `1px solid rgba(184,134,11,0.20)`,
        padding: 18,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 132,
        cursor: "pointer",
        boxShadow: "0 1px 1px rgba(184,134,11,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <IconChip icon={icon} tone="gold" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: BODY_FONT,
              fontSize: 14.5,
              fontWeight: 600,
              color: COLORS.ink,
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontFamily: BODY_FONT,
              fontSize: 12.5,
              color: COLORS.inkMuted,
              marginTop: 4,
              lineHeight: 1.45,
            }}
          >
            {blurb}
          </div>
        </div>
        <div style={{ position: "absolute", top: 14, right: 14 }}>
          <Lock size={14} strokeWidth={1.8} color={COLORS.gold} />
        </div>
      </div>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          borderTop: `1px dashed rgba(184,134,11,0.18)`,
        }}
      >
        <PlanChip plan={requiredPlan} locked />
        <span
          style={{
            fontFamily: BODY_FONT,
            fontSize: 11,
            fontWeight: 600,
            color: COLORS.gold,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Upgrade
          <ChevronRight size={12} strokeWidth={2.2} color={COLORS.gold} />
        </span>
      </div>
    </div>
  );
}

// ─── Topbar (admin shell chrome) ─────────────────────────────────────

function Topbar({ scene }: { scene: Scene }) {
  return (
    <div
      style={{
        background: COLORS.card,
        borderBottom: `1px solid ${COLORS.border}`,
        padding: "10px 22px",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      {/* Workspace switcher */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 9px 5px 6px",
          borderRadius: 8,
          background: "rgba(11,11,13,0.035)",
          boxShadow: `inset 0 0 0 1px ${COLORS.borderSoft}`,
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: COLORS.ink,
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: DISPLAY_FONT,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          A
        </span>
        <span
          style={{
            fontFamily: BODY_FONT,
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.ink,
          }}
        >
          {TENANT_NAME}
        </span>
        <span style={{ color: COLORS.inkDim, fontSize: 11 }}>/{TENANT_SLUG}/admin</span>
      </div>

      {/* Page nav */}
      <nav style={{ display: "flex", gap: 2, marginLeft: 8 }}>
        {PAGES.map((p) => {
          const active = scene.page === p.id;
          return (
            <a
              key={p.id}
              href={sceneHref({ ...scene, page: p.id, mode: "default", role: scene.role === "viewer" && p.id !== "overview" ? "owner" : scene.role })}
              style={{
                padding: "7px 12px",
                borderRadius: 7,
                fontFamily: BODY_FONT,
                fontSize: 13,
                fontWeight: 500,
                color: active ? COLORS.ink : COLORS.inkMuted,
                background: active ? "rgba(11,11,13,0.06)" : "transparent",
                textDecoration: "none",
              }}
            >
              {p.label}
            </a>
          );
        })}
      </nav>

      {/* Right side: plan + role + avatar */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <PlanChip plan={scene.plan} />
        <span
          style={{
            fontFamily: BODY_FONT,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: COLORS.inkMuted,
          }}
        >
          {ROLE_LABELS[scene.role]}
        </span>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            background: COLORS.cream,
            color: COLORS.ink,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: BODY_FONT,
            fontSize: 11,
            fontWeight: 600,
            boxShadow: `inset 0 0 0 1px ${COLORS.borderSoft}`,
            cursor: "pointer",
          }}
          title="My Profile (avatar drawer — Phase 2)"
        >
          OT
        </span>
      </div>
    </div>
  );
}

// ─── Page header ─────────────────────────────────────────────────────

function PageHeader({
  eyebrow,
  title,
  subtitle,
  rightSlot,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        padding: "28px 4px 18px",
      }}
    >
      <div>
        {eyebrow ? (
          <div style={{ marginBottom: 6 }}>
            <CapsLabel tone="muted">{eyebrow}</CapsLabel>
          </div>
        ) : null}
        <h1
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 38,
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            margin: 0,
            color: COLORS.ink,
            fontWeight: 500,
          }}
        >
          {title}
        </h1>
        {subtitle ? (
          <div
            style={{
              fontFamily: BODY_FONT,
              fontSize: 14,
              color: COLORS.inkMuted,
              marginTop: 6,
              maxWidth: 640,
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      {rightSlot ? <div>{rightSlot}</div> : null}
    </div>
  );
}

// ─── Plan ladder (Site only) ─────────────────────────────────────────

function PlanLadder({ current }: { current: Plan }) {
  const items: { plan: Plan; unlocks: string }[] = [
    { plan: "free", unlocks: "Site basics" },
    { plan: "studio", unlocks: "Domain · Widgets · API" },
    { plan: "agency", unlocks: "Design system · Branding tools" },
    { plan: "network", unlocks: "Hubs · Multi-agency" },
  ];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        padding: 14,
        background: COLORS.card,
        borderRadius: 12,
        border: `1px solid ${COLORS.border}`,
        marginBottom: 16,
      }}
    >
      {items.map((it, i) => {
        const active = it.plan === current;
        const passed = PLAN_RANK[it.plan] < PLAN_RANK[current];
        const future = PLAN_RANK[it.plan] > PLAN_RANK[current];
        return (
          <div
            key={it.plan}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              paddingLeft: i === 0 ? 0 : 14,
              paddingRight: i === items.length - 1 ? 0 : 14,
              borderLeft: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
              opacity: future ? 0.66 : 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: active ? COLORS.gold : passed ? COLORS.ink : "rgba(11,11,13,0.12)",
                  boxShadow: active ? "0 0 0 4px rgba(184,134,11,0.14)" : undefined,
                }}
              />
              <span
                style={{
                  fontFamily: BODY_FONT,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: active ? COLORS.gold : COLORS.ink,
                }}
              >
                {PLAN_LABELS[it.plan]}
              </span>
              {active ? (
                <span
                  style={{
                    fontFamily: BODY_FONT,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: COLORS.gold,
                  }}
                >
                  Current
                </span>
              ) : null}
            </div>
            <div
              style={{
                fontFamily: BODY_FONT,
                fontSize: 11.5,
                color: COLORS.inkMuted,
                lineHeight: 1.4,
              }}
            >
              {it.unlocks}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Card grid ───────────────────────────────────────────────────────

function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

// ─── Banners ─────────────────────────────────────────────────────────

function StarterBanner() {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, #FFFDFA 0%, #FAF5EC 100%)",
        borderRadius: 14,
        border: `1px solid rgba(184,134,11,0.22)`,
        padding: "16px 18px",
        marginBottom: 16,
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
      }}
    >
      <IconChip icon={Sparkles} tone="gold" />
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 22,
            color: COLORS.ink,
            lineHeight: 1.15,
            fontWeight: 500,
          }}
        >
          Welcome to your starter workspace
        </div>
        <div
          style={{
            fontFamily: BODY_FONT,
            fontSize: 13,
            color: COLORS.inkMuted,
            marginTop: 4,
            maxWidth: 580,
            lineHeight: 1.5,
          }}
        >
          Everything you need to start running your roster is set up. The cards
          marked <Lock size={11} strokeWidth={2} style={{ display: "inline", verticalAlign: -1 }} /> grow with you when you upgrade — they&apos;re here to show you what&apos;s next, not to get in your way.
        </div>
      </div>
      <a
        href={sceneHref({ ...DEFAULT_SCENE, page: "workspace", plan: "free", mode: "starter" })}
        style={{
          fontFamily: BODY_FONT,
          fontSize: 12,
          fontWeight: 600,
          color: COLORS.gold,
          textDecoration: "none",
          padding: "8px 12px",
          borderRadius: 8,
          background: "rgba(184,134,11,0.08)",
          boxShadow: `inset 0 0 0 1px rgba(184,134,11,0.22)`,
          alignSelf: "center",
          whiteSpace: "nowrap",
        }}
      >
        See plan options →
      </a>
    </div>
  );
}

function UpsellBanner() {
  return (
    <div
      style={{
        background: COLORS.ink,
        color: "#fff",
        borderRadius: 14,
        padding: "18px 22px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: BODY_FONT,
            fontSize: 10.5,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.55)",
            fontWeight: 600,
          }}
        >
          Studio plan unlocks the rest of Site
        </div>
        <div
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 26,
            lineHeight: 1.1,
            marginTop: 4,
            fontWeight: 500,
          }}
        >
          Custom domain, embeddable widgets, API keys, advanced SEO.
        </div>
        <div
          style={{
            fontFamily: BODY_FONT,
            fontSize: 13,
            color: "rgba(255,255,255,0.7)",
            marginTop: 6,
          }}
        >
          Five locked cards below. Click any to compare plans.
        </div>
      </div>
      <a
        href="#"
        style={{
          fontFamily: BODY_FONT,
          fontSize: 13,
          fontWeight: 600,
          color: COLORS.ink,
          background: "#fff",
          textDecoration: "none",
          padding: "10px 16px",
          borderRadius: 8,
          whiteSpace: "nowrap",
        }}
      >
        Upgrade to Studio →
      </a>
    </div>
  );
}

// ─── Page renderers ──────────────────────────────────────────────────

function OverviewPage({ scene }: { scene: Scene }) {
  const { plan, role } = scene;
  const isFree = plan === "free";
  const isViewer = role === "viewer";
  const showSiteHealth = role === "admin" || role === "owner";
  const showTeam = role === "admin" || role === "owner";
  return (
    <>
      <PageHeader
        eyebrow="Today"
        title={isFree ? "Welcome back" : "Good morning, Oran"}
        subtitle={
          isViewer
            ? "Here's what's happening in the workspace today. You have read-only access."
            : "Here's what needs your attention right now. Nothing else demands a click."
        }
        rightSlot={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isViewer ? <ReadOnlyChip /> : null}
            <CapsLabel>{new Date().toDateString()}</CapsLabel>
          </div>
        }
      />
      <CardGrid>
        <Card
          icon={Activity}
          title="Today's pulse"
          status={isFree ? "Quiet day. Nothing waiting." : "2 inquiries · 1 hold · 3 confirmations"}
          affordance={isViewer ? "none" : "drawer"}
        >
          {isFree ? (
            <EmptyHint>Once inquiries arrive they appear here.</EmptyHint>
          ) : (
            <StatRow
              items={[
                { label: "Inquiries", value: "2", tone: "amber" },
                { label: "Holds", value: "1" },
                { label: "Confirms", value: "3", tone: "green" },
              ]}
            />
          )}
        </Card>

        <Card
          icon={Bell}
          title="Inquiries needing me"
          status={isFree ? "0 awaiting" : "4 awaiting your offer"}
          affordance={isViewer ? "none" : "drawer"}
          topRight={isViewer ? <ReadOnlyChip /> : null}
        >
          {isFree ? (
            <EmptyHint>New inquiries from your site land here.</EmptyHint>
          ) : (
            <>
              <Bullet tone="amber">Vogue Italia · Marta R · 2d</Bullet>
              <Bullet tone="amber">Zara · Kai L · 1d</Bullet>
              <Bullet tone="amber">Mango lookbook · 6h</Bullet>
            </>
          )}
        </Card>

        <Card
          icon={Calendar}
          title="Bookings this week"
          status={isFree ? "0 confirmed" : "3 confirmed Tue–Fri"}
          affordance={isViewer ? "none" : "drawer"}
          topRight={isViewer ? <ReadOnlyChip /> : null}
        >
          {isFree ? (
            <EmptyHint>Confirmed bookings will appear here.</EmptyHint>
          ) : (
            <>
              <Bullet tone="green">Tue · Mango shoot · 3 talent</Bullet>
              <Bullet tone="green">Thu · Bvlgari · 1 talent</Bullet>
              <Bullet tone="ink">Fri · Editorial · 2 talent</Bullet>
            </>
          )}
        </Card>

        <Card
          icon={Users}
          title="Recent talent activity"
          status={isFree ? "Quiet" : "2 new portfolios · 1 update"}
          affordance="drawer"
        >
          {isFree ? (
            <EmptyHint>Activity from your roster will appear here.</EmptyHint>
          ) : (
            <>
              <Bullet>Marta R · uploaded portfolio</Bullet>
              <Bullet>Kai L · updated measurements</Bullet>
            </>
          )}
        </Card>

        {showSiteHealth ? (
          <Card
            icon={isFree ? CheckCircle2 : AlertCircle}
            title="Site health"
            status={isFree ? "Everything published" : "1 page in draft"}
            affordance="drawer"
          >
            <Bullet tone={isFree ? "green" : "amber"}>
              {isFree ? "All pages live" : "Press kit · pending publish"}
            </Bullet>
            <Bullet tone="green">Domain connected</Bullet>
            <Bullet tone="green">SEO defaults set</Bullet>
          </Card>
        ) : null}

        {showTeam ? (
          <Card
            icon={Workflow}
            title="Team activity"
            status={isFree ? "Just you" : "3 members active today"}
            affordance="drawer"
          >
            {isFree ? (
              <EmptyHint>Invite a teammate from the Workspace page.</EmptyHint>
            ) : (
              <>
                <Bullet tone="green">Sara · 12 actions</Bullet>
                <Bullet tone="green">Daniel · 7 actions</Bullet>
                <Bullet>Mira · viewed roster</Bullet>
              </>
            )}
          </Card>
        ) : null}
      </CardGrid>
    </>
  );
}

function WorkPage({ scene }: { scene: Scene }) {
  const isFree = scene.plan === "free";
  return (
    <>
      <PageHeader
        eyebrow="Work"
        title="Inquiries & bookings"
        subtitle="One pipeline. Each card is a slice of what's moving — open it to act."
      />
      <CardGrid>
        <Card
          icon={Workflow}
          title="Pipeline"
          status={isFree ? "Empty — your first inquiry will appear here" : "12 open · 3 stages"}
          affordance="drawer"
          span={2}
        >
          {isFree ? (
            <EmptyHint>You haven&apos;t received any inquiries yet.</EmptyHint>
          ) : (
            <StatRow
              items={[
                { label: "Drafts", value: "2", tone: "dim" },
                { label: "Awaiting", value: "4", tone: "amber" },
                { label: "Confirmed", value: "3", tone: "green" },
                { label: "Archived", value: "27", tone: "dim" },
              ]}
            />
          )}
        </Card>

        <Card
          icon={Plus}
          title="New inquiry"
          status="Start a new request from scratch"
          affordance="drawer"
        >
          <Bullet tone="ink">Or import from email later</Bullet>
        </Card>

        <Card
          icon={FileEdit}
          title="Drafts & holds"
          status={isFree ? "0 drafts" : "2 drafts pending"}
          affordance="drawer"
        >
          {isFree ? (
            <EmptyHint>Inquiries you start will land here.</EmptyHint>
          ) : (
            <>
              <Bullet tone="dim">Editorial · Bvlgari · 2d old</Bullet>
              <Bullet tone="amber">Hold · Stylist meeting · 4d</Bullet>
            </>
          )}
        </Card>

        <Card
          icon={Clock}
          title="Awaiting client"
          status={isFree ? "Nothing waiting" : "4 offers out · oldest 3d"}
          affordance="drawer"
        >
          {isFree ? (
            <EmptyHint>Offers you send appear here until accepted.</EmptyHint>
          ) : (
            <>
              <Bullet tone="amber">Mango lookbook · 3d</Bullet>
              <Bullet tone="amber">Zara · 1d</Bullet>
            </>
          )}
        </Card>

        <Card
          icon={CheckCircle2}
          title="Confirmed bookings"
          status={isFree ? "0 booked" : "3 this week"}
          affordance="drawer"
        >
          {isFree ? (
            <EmptyHint>Confirmed inquiries become bookings here.</EmptyHint>
          ) : (
            <>
              <Bullet tone="green">Tue · Mango · 3 talent</Bullet>
              <Bullet tone="green">Thu · Bvlgari · 1</Bullet>
              <Bullet tone="green">Fri · Editorial · 2</Bullet>
            </>
          )}
        </Card>

        <Card
          icon={Layers}
          title="Cancelled / archived"
          status={isFree ? "0 archived" : "27 in last 30 days"}
          affordance="drawer"
        />
      </CardGrid>
    </>
  );
}

function TalentPage({ scene }: { scene: Scene }) {
  const isFree = scene.plan === "free";
  return (
    <>
      <PageHeader
        eyebrow="Talent"
        title="Roster"
        subtitle="The people you represent. Profiles, requests, and what's visible to clients."
      />
      <CardGrid>
        <Card
          icon={Users}
          title="Roster grid"
          status={isFree ? "4 talent · all visible" : "47 talent · 32 published"}
          affordance="drawer"
          span={2}
        >
          {isFree ? (
            <StatRow
              items={[
                { label: "Active", value: "4" },
                { label: "Drafts", value: "0", tone: "dim" },
                { label: "Published", value: "4", tone: "green" },
              ]}
            />
          ) : (
            <StatRow
              items={[
                { label: "Active", value: "47" },
                { label: "New this month", value: "5", tone: "green" },
                { label: "Drafts", value: "3", tone: "amber" },
                { label: "Published", value: "32", tone: "green" },
              ]}
            />
          )}
        </Card>

        <Card
          icon={Plus}
          title="Add talent"
          status="Start a new profile from scratch"
          affordance="drawer"
        >
          <Bullet tone="ink">Or invite them to fill it themselves</Bullet>
        </Card>

        <Card
          icon={UserPlus}
          title="Representation requests"
          status={isFree ? "0 pending" : "3 pending review"}
          affordance="drawer"
        >
          {isFree ? (
            <EmptyHint>Requests from talent appear here.</EmptyHint>
          ) : (
            <>
              <Bullet tone="amber">Lina P · submitted 1d</Bullet>
              <Bullet tone="amber">Tomás N · submitted 3d</Bullet>
              <Bullet tone="amber">Amelia D · submitted 5d</Bullet>
            </>
          )}
        </Card>

        <Card
          icon={Eye}
          title="Storefront visibility"
          status={isFree ? "All 4 visible on site" : "32 of 47 published"}
          affordance="drawer"
        >
          <Bullet tone="green">Visible: {isFree ? "4" : "32"}</Bullet>
          <Bullet tone="dim">Hidden: {isFree ? "0" : "15"}</Bullet>
        </Card>

        <Card
          icon={Database}
          title="Roster fields & catalog"
          status="8 fields · 4 categories"
          affordance="drawer"
        />

        <LockedCard
          icon={Network}
          title="Hub publishing"
          blurb="Submit talent to partner agencies and shared talent hubs."
          requiredPlan="network"
        />
      </CardGrid>
    </>
  );
}

function ClientsPage({ scene }: { scene: Scene }) {
  const isFree = scene.plan === "free";
  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Client relationships"
        subtitle="Who you work with, and the history that lives behind each name."
      />
      <CardGrid>
        <Card
          icon={Building2}
          title="Client list"
          status={isFree ? "1 client · 1 contact" : "84 clients · 142 contacts"}
          affordance="drawer"
          span={2}
        >
          {isFree ? (
            <Bullet tone="ink">First client added — keep going.</Bullet>
          ) : (
            <StatRow
              items={[
                { label: "Active", value: "62", tone: "green" },
                { label: "Dormant", value: "22", tone: "dim" },
                { label: "Top 10 spend", value: "76%" },
              ]}
            />
          )}
        </Card>

        <Card icon={Plus} title="Add client" status="Create a new client record" affordance="drawer" />

        <Card
          icon={Briefcase}
          title="Relationship history"
          status={isFree ? "1 entry" : "12 recent · 412 total"}
          affordance="drawer"
        >
          {isFree ? null : (
            <>
              <Bullet>Mango · 4 bookings YTD</Bullet>
              <Bullet>Bvlgari · 2 bookings YTD</Bullet>
            </>
          )}
        </Card>

        {isFree ? null : (
          <Card
            icon={Shield}
            title="Private client data"
            status="21 records · coordinator-visible"
            affordance="drawer"
          >
            <Bullet tone="dim">Rates, terms, internal notes</Bullet>
          </Card>
        )}

        {isFree ? null : (
          <Card
            icon={Filter}
            title="Filter configuration"
            status="4 filters · 2 saved views"
            affordance="drawer"
          />
        )}
      </CardGrid>
    </>
  );
}

function SitePage({ scene }: { scene: Scene }) {
  const { plan, role, mode } = scene;
  const isFree = plan === "free";
  const isUpsell = mode === "upsell";

  // Card visibility per role
  const showIdentity = role === "admin" || role === "owner";
  const showBranding = role === "admin" || role === "owner";
  const showDesign = role === "admin" || role === "owner";
  const showSEO = role === "admin" || role === "owner";
  const showDomain = role === "admin" || role === "owner";
  const showWidgets = role === "admin" || role === "owner";
  const showAPI = role === "admin" || role === "owner";

  // Plan gates
  const designLocked = !meetsPlan(plan, "agency");
  const domainLocked = !meetsPlan(plan, "studio");
  const widgetsLocked = !meetsPlan(plan, "studio");
  const apiLocked = !meetsPlan(plan, "studio");

  const publishLabel = role === "editor" ? "Save draft only" : role === "coordinator" ? "Edit & publish" : null;

  return (
    <>
      <PageHeader
        eyebrow="Site"
        title="Public site"
        subtitle="Everything visible at acme-models.com — identity, design, content, and the surfaces that grow with your plan."
        rightSlot={publishLabel ? <CapsLabel tone="muted">{publishLabel}</CapsLabel> : null}
      />

      {isUpsell ? <UpsellBanner /> : null}
      <PlanLadder current={plan} />

      <CardGrid>
        {showIdentity ? (
          <Card icon={Tag} title="Identity" status="Name · tagline · favicon" affordance="drawer" />
        ) : null}
        {showBranding ? (
          <Card icon={Palette} title="Branding" status="Palette · type · logo" affordance="drawer" />
        ) : null}
        {showDesign ? (
          designLocked ? (
            <LockedCard
              icon={Layers}
              title="Design system"
              blurb="Token control, custom CSS, component overrides."
              requiredPlan="agency"
            />
          ) : (
            <Card icon={Layers} title="Design system" status="Tokens · CSS overrides" affordance="drawer" />
          )
        ) : null}

        <Card
          icon={Sparkles}
          title="Homepage"
          status={isFree ? "Default layout" : "Composed · 6 sections"}
          affordance="drawer"
        />
        <Card
          icon={FileText}
          title="Pages"
          status={isFree ? "3 pages · all live" : "6 published · 1 draft"}
          affordance="drawer"
        />
        <Card
          icon={Workflow}
          title="Navigation"
          status={isFree ? "5 items" : "5 items · 2 menus"}
          affordance="drawer"
        />
        <Card
          icon={ImageIcon}
          title="Media library"
          status={isFree ? "12 items" : "142 items · 4.2 GB"}
          affordance="drawer"
        />
        <Card
          icon={Languages}
          title="Translations"
          status={isFree ? "1 locale" : "2 locales · 84% coverage"}
          affordance="drawer"
        />

        {showSEO ? (
          <Card
            icon={Search}
            title="SEO & defaults"
            status={isFree ? "Defaults set" : "Custom meta · sitemap live"}
            affordance="drawer"
          />
        ) : null}

        {showDomain ? (
          domainLocked ? (
            <LockedCard
              icon={Globe}
              title="Custom domain"
              blurb="Connect acme-models.com — replaces the .tulala.app subdomain."
              requiredPlan="studio"
            />
          ) : (
            <Card icon={Globe} title="Custom domain" status="acme-models.com · live" affordance="drawer" />
          )
        ) : null}

        {showWidgets ? (
          widgetsLocked ? (
            <LockedCard
              icon={Code2}
              title="Widgets / embeds"
              blurb="Drop your roster onto external sites with one snippet."
              requiredPlan="studio"
            />
          ) : (
            <Card icon={Code2} title="Widgets / embeds" status="2 widgets · 4 embeds" affordance="drawer" />
          )
        ) : null}

        {showAPI ? (
          apiLocked ? (
            <LockedCard
              icon={KeyRound}
              title="API keys"
              blurb="Programmatic access to your roster and bookings."
              requiredPlan="studio"
            />
          ) : (
            <Card icon={KeyRound} title="API keys" status="2 keys · last used 3h" affordance="drawer" />
          )
        ) : null}

        {/* Upsell mode: extra aspirational locked cards */}
        {isUpsell ? (
          <>
            <LockedCard
              icon={Sparkles}
              title="Remove Tulala badge"
              blurb="Ship a fully white-labeled site to your clients."
              requiredPlan="studio"
            />
            <LockedCard
              icon={Network}
              title="Hub publishing"
              blurb="Submit roster to partner-agency talent hubs."
              requiredPlan="network"
            />
          </>
        ) : null}
      </CardGrid>
    </>
  );
}

function WorkspacePage({ scene }: { scene: Scene }) {
  const { plan, mode } = scene;
  const isFree = plan === "free";
  const isStarter = mode === "starter";
  const domainLocked = !meetsPlan(plan, "studio");

  return (
    <>
      {isStarter ? <StarterBanner /> : null}
      <PageHeader
        eyebrow="Workspace"
        title="Workspace settings"
        subtitle="Team, plan, domain, catalog. The meta-controls for how your workspace runs."
      />
      <CardGrid>
        <Card
          icon={Users}
          title="Team"
          status={isFree ? "Just you" : "8 members · 2 admins"}
          affordance="drawer"
          tone={isStarter ? "starter" : "default"}
        >
          {isFree ? (
            <EmptyHint>Invite a teammate to share the workload.</EmptyHint>
          ) : (
            <>
              <Bullet tone="green">2 admin · 4 coordinator · 2 viewer</Bullet>
              <Bullet>1 invite pending</Bullet>
            </>
          )}
        </Card>

        <Card
          icon={CreditCard}
          title="Plan & billing"
          status={isFree ? "Free · upgrade anytime" : "Agency · $99/mo · renews May 12"}
          affordance="drawer"
          tone={isStarter ? "starter" : "default"}
        >
          {isFree ? (
            <Bullet tone="amber">3 features locked · click to compare</Bullet>
          ) : (
            <StatRow
              items={[
                { label: "Plan", value: "Agency" },
                { label: "Seats", value: "8/15" },
                { label: "Renews", value: "May 12" },
              ]}
            />
          )}
        </Card>

        {domainLocked ? (
          <LockedCard
            icon={Globe}
            title="Custom domain"
            blurb="Use your own domain instead of acme-models.tulala.app."
            requiredPlan="studio"
          />
        ) : (
          <Card icon={Globe} title="Custom domain" status="acme-models.com · live" affordance="drawer" />
        )}

        <Card
          icon={Settings}
          title="Workspace settings"
          status={isFree ? "Defaults set" : "12 settings configured"}
          affordance="drawer"
        />
        <Card
          icon={Database}
          title="Field catalog"
          status={isFree ? "Default fields" : "8 talent fields · 4 client"}
          affordance="drawer"
        />
        <Card
          icon={MapPin}
          title="Taxonomy & locations"
          status={isFree ? "Defaults" : "12 categories · 4 cities"}
          affordance="drawer"
        />

        <LockedCard
          icon={Network}
          title="Multi-agency manager"
          blurb="Run multiple agencies under one parent organization."
          requiredPlan="network"
        />

        <Card icon={ShieldAlert} title="Danger zone" status="Transfer ownership · suspend workspace" affordance="drawer" tone="danger" />
      </CardGrid>
    </>
  );
}

// ─── Scene picker ────────────────────────────────────────────────────

function ScenePicker({ scene }: { scene: Scene }) {
  const groups = ["Core (Free vs Agency)", "Role variants", "Persona states"] as const;
  return (
    <div
      style={{
        background: COLORS.navyBg,
        color: "#fff",
        padding: "10px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontFamily: BODY_FONT,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 18,
            fontWeight: 500,
            letterSpacing: "-0.01em",
          }}
        >
          Phase 1 — Workspace admin shell
        </span>
        <span
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {SCENES.length} scenes · click to swap
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 14 }}>
          <LegendDot color={COLORS.inkDim} label="Drawer affordance → Phase 2" />
          <LegendDot color={COLORS.gold} label="Upgrade affordance → Phase 3" />
        </span>
      </div>
      {groups.map((g) => {
        const items = SCENES.filter((s) => s.group === g);
        return (
          <div key={g} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 10.5,
                color: "rgba(255,255,255,0.4)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 600,
                width: 110,
                flexShrink: 0,
              }}
            >
              {g}
            </span>
            {items.map((s) => {
              const active = s.id === scene.id;
              return (
                <a
                  key={s.id}
                  href={sceneHref(s)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 6,
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: active ? COLORS.ink : "rgba(255,255,255,0.85)",
                    background: active ? "#fff" : "rgba(255,255,255,0.06)",
                    boxShadow: active ? "none" : "inset 0 0 0 1px rgba(255,255,255,0.10)",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.label}
                </a>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
      {label}
    </span>
  );
}

// ─── Page entry ──────────────────────────────────────────────────────

export default function AdminShellPrototypePage() {
  const params = useSearchParams();
  const scene = findScene(params ?? new URLSearchParams());

  return (
    <div style={{ background: COLORS.surface, minHeight: "100vh", fontFamily: BODY_FONT, color: COLORS.ink }}>
      <ScenePicker scene={scene} />
      <Topbar scene={scene} />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 22px 56px" }}>
        {scene.page === "overview" ? <OverviewPage scene={scene} /> : null}
        {scene.page === "work" ? <WorkPage scene={scene} /> : null}
        {scene.page === "talent" ? <TalentPage scene={scene} /> : null}
        {scene.page === "clients" ? <ClientsPage scene={scene} /> : null}
        {scene.page === "site" ? <SitePage scene={scene} /> : null}
        {scene.page === "workspace" ? <WorkspacePage scene={scene} /> : null}
      </div>
    </div>
  );
}
