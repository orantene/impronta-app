"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ─── Four dimensions ─────────────────────────────────────────────────

export type Surface = "workspace" | "talent" | "client" | "platform";
export type Plan = "free" | "studio" | "agency" | "network";
export type Role = "viewer" | "editor" | "coordinator" | "admin" | "owner";
export type WorkspacePage =
  | "overview"
  | "work"
  | "talent"
  | "clients"
  | "site"
  | "workspace";

export const SURFACES: Surface[] = ["workspace", "talent", "client", "platform"];
export const PLANS: Plan[] = ["free", "studio", "agency", "network"];
export const ROLES: Role[] = ["viewer", "editor", "coordinator", "admin", "owner"];
export const WORKSPACE_PAGES: WorkspacePage[] = [
  "overview",
  "work",
  "talent",
  "clients",
  "site",
  "workspace",
];

// ─── Semantics ───────────────────────────────────────────────────────

export const PLAN_META: Record<Plan, { label: string; theme: string; rank: number }> = {
  free: { label: "Free", theme: "Join the ecosystem", rank: 0 },
  studio: { label: "Studio", theme: "Gain control", rank: 1 },
  agency: { label: "Agency", theme: "Branded operation", rank: 2 },
  network: { label: "Network", theme: "Multi-brand · hub", rank: 3 },
};

export const ROLE_META: Record<Role, { label: string; rank: number }> = {
  viewer: { label: "Viewer", rank: 0 },
  editor: { label: "Editor", rank: 1 },
  coordinator: { label: "Coordinator", rank: 2 },
  admin: { label: "Admin", rank: 3 },
  owner: { label: "Owner", rank: 4 },
};

export const SURFACE_META: Record<
  Surface,
  { label: string; short: string; ready: boolean }
> = {
  workspace: { label: "Workspace Admin", short: "Workspace", ready: true },
  talent: { label: "Talent", short: "Talent", ready: false },
  client: { label: "Client", short: "Client", ready: false },
  platform: { label: "Platform · Super Admin", short: "Platform", ready: true },
};

export const PAGE_META: Record<WorkspacePage, { label: string }> = {
  overview: { label: "Overview" },
  work: { label: "Work" },
  talent: { label: "Talent" },
  clients: { label: "Clients" },
  site: { label: "Site" },
  workspace: { label: "Workspace" },
};

export function meetsPlan(current: Plan, required: Plan): boolean {
  return PLAN_META[current].rank >= PLAN_META[required].rank;
}

export function meetsRole(current: Role, required: Role): boolean {
  return ROLE_META[current].rank >= ROLE_META[required].rank;
}

// ─── Drawer + modal IDs ──────────────────────────────────────────────

export type DrawerId =
  | "branding"
  | "identity"
  | "domain"
  | "team"
  | "plan-billing"
  | "talent-profile"
  | "inquiry-peek"
  | "booking-peek"
  | "new-inquiry"
  | "new-talent"
  | "my-profile"
  | "design"
  | "homepage"
  | "pages"
  | "navigation"
  | "media"
  | "translations"
  | "seo"
  | "field-catalog"
  | "taxonomy"
  | "workspace-settings"
  | "client-profile"
  | "site-health"
  | "team-activity"
  | "talent-activity"
  | "today-pulse"
  | "pipeline"
  | "drafts-holds"
  | "awaiting-client"
  | "confirmed-bookings"
  | "archived-work"
  | "representation-requests"
  | "storefront-visibility"
  | "hub-distribution"
  | "client-list"
  | "relationship-history"
  | "private-client-data"
  | "filter-config"
  | "danger-zone"
  | "activation-checklist";

export type DrawerContext = {
  drawerId: DrawerId | null;
  payload?: Record<string, unknown>;
};

// ─── Upgrade modal ───────────────────────────────────────────────────

export type UpgradeOffer = {
  open: boolean;
  feature?: string;
  why?: string;
  requiredPlan?: Plan;
  unlocks?: string[];
};

// ─── Mock data ───────────────────────────────────────────────────────

export type TalentProfile = {
  id: string;
  name: string;
  state: "draft" | "invited" | "published" | "awaiting-approval" | "claimed";
  height?: string;
  city?: string;
  thumb?: string;
  isYou?: boolean;
};

export const TALENT_STATE_LABEL: Record<TalentProfile["state"], string> = {
  draft: "Draft",
  invited: "Invited",
  published: "Published",
  "awaiting-approval": "Awaiting approval",
  claimed: "Claimed",
};

export const TALENT_STATE_TONE: Record<
  TalentProfile["state"],
  "ink" | "amber" | "green" | "dim"
> = {
  draft: "dim",
  invited: "amber",
  published: "green",
  "awaiting-approval": "amber",
  claimed: "ink",
};

export const ROSTER_FREE: TalentProfile[] = [
  { id: "t1", name: "Marta Reyes", state: "published", height: "5'9\"", city: "Madrid", thumb: "🌸" },
  { id: "t2", name: "Kai Lin", state: "awaiting-approval", height: "5'11\"", city: "Berlin", thumb: "🌊" },
  { id: "t3", name: "Amelia Dorsey", state: "invited", height: "5'8\"", city: "Lisbon", thumb: "🌿" },
];

export const ROSTER_AGENCY: TalentProfile[] = [
  { id: "t1", name: "Marta Reyes", state: "published", height: "5'9\"", city: "Madrid", thumb: "🌸" },
  { id: "t2", name: "Kai Lin", state: "published", height: "5'11\"", city: "Berlin", thumb: "🌊" },
  { id: "t3", name: "Tomás Navarro", state: "published", height: "6'1\"", city: "Lisbon", thumb: "🍃" },
  { id: "t4", name: "Lina Park", state: "awaiting-approval", height: "5'7\"", city: "Paris", thumb: "🌷" },
  { id: "t5", name: "Amelia Dorsey", state: "invited", height: "5'8\"", city: "Lisbon", thumb: "🌿" },
  { id: "t6", name: "Sven Olafsson", state: "draft", height: "6'0\"", city: "Oslo", thumb: "🌲" },
  { id: "t7", name: "Zara Habib", state: "published", height: "5'10\"", city: "London", thumb: "🌹" },
];

export type Inquiry = {
  id: string;
  client: string;
  brief: string;
  stage: "draft" | "awaiting-client" | "confirmed" | "archived" | "hold";
  ageDays: number;
  talent: string[];
  amount?: string;
  date?: string;
};

export const INQUIRIES_AGENCY: Inquiry[] = [
  { id: "iq1", client: "Vogue Italia", brief: "Editorial · spring spread", stage: "awaiting-client", ageDays: 2, talent: ["Marta Reyes"], amount: "€4,200", date: "May 14" },
  { id: "iq2", client: "Zara", brief: "Lookbook · capsule collection", stage: "awaiting-client", ageDays: 1, talent: ["Kai Lin"], amount: "€2,800", date: "May 18" },
  { id: "iq3", client: "Mango", brief: "Lookbook shoot", stage: "draft", ageDays: 0, talent: ["Marta Reyes", "Tomás Navarro", "Zara Habib"], amount: "€6,400" },
  { id: "iq4", client: "Bvlgari", brief: "Editorial campaign", stage: "hold", ageDays: 4, talent: ["Marta Reyes"], amount: "€8,000" },
  { id: "iq5", client: "Mango", brief: "Spring lookbook", stage: "confirmed", ageDays: 6, talent: ["Marta Reyes", "Tomás Navarro", "Zara Habib"], amount: "€6,400", date: "Tue · this week" },
  { id: "iq6", client: "Bvlgari", brief: "Jewelry campaign", stage: "confirmed", ageDays: 3, talent: ["Kai Lin"], amount: "€8,200", date: "Thu · this week" },
  { id: "iq7", client: "Editorial Studio", brief: "Editorial · 2 talent", stage: "confirmed", ageDays: 1, talent: ["Lina Park", "Marta Reyes"], amount: "€4,000", date: "Fri · this week" },
];

export const INQUIRIES_FREE: Inquiry[] = [
  { id: "iq1", client: "Friend referral", brief: "Test booking", stage: "draft", ageDays: 0, talent: ["Marta Reyes"] },
];

export type Client = {
  id: string;
  name: string;
  contact: string;
  bookingsYTD: number;
  status: "active" | "dormant";
};

export const CLIENTS_AGENCY: Client[] = [
  { id: "c1", name: "Vogue Italia", contact: "Sara Bianchi", bookingsYTD: 6, status: "active" },
  { id: "c2", name: "Mango", contact: "Joana Rivera", bookingsYTD: 4, status: "active" },
  { id: "c3", name: "Zara", contact: "Lucas Vidal", bookingsYTD: 3, status: "active" },
  { id: "c4", name: "Bvlgari", contact: "Marco Conti", bookingsYTD: 2, status: "active" },
  { id: "c5", name: "Net-a-Porter", contact: "Helena Ross", bookingsYTD: 1, status: "dormant" },
];

export const CLIENTS_FREE: Client[] = [
  { id: "c1", name: "Friend referral", contact: "—", bookingsYTD: 0, status: "active" },
];

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "invited";
  initials: string;
};

export const TEAM_AGENCY: TeamMember[] = [
  { id: "u1", name: "Oran Tene", email: "oran@acme-models.com", role: "owner", status: "active", initials: "OT" },
  { id: "u2", name: "Sara Bianchi", email: "sara@acme-models.com", role: "admin", status: "active", initials: "SB" },
  { id: "u3", name: "Daniel Ferrer", email: "daniel@acme-models.com", role: "coordinator", status: "active", initials: "DF" },
  { id: "u4", name: "Mira Soto", email: "mira@acme-models.com", role: "viewer", status: "active", initials: "MS" },
  { id: "u5", name: "Andrés Lopez", email: "andres@acme-models.com", role: "editor", status: "invited", initials: "AL" },
];

export const TEAM_FREE: TeamMember[] = [
  { id: "u1", name: "You", email: "you@acme-models.com", role: "owner", status: "active", initials: "OT" },
];

export type SitePage = {
  id: string;
  title: string;
  status: "published" | "draft";
  updatedAgo: string;
};

export const SITE_PAGES: SitePage[] = [
  { id: "p1", title: "Home", status: "published", updatedAgo: "2d" },
  { id: "p2", title: "Roster", status: "published", updatedAgo: "5d" },
  { id: "p3", title: "About us", status: "published", updatedAgo: "1mo" },
  { id: "p4", title: "Contact", status: "published", updatedAgo: "2mo" },
  { id: "p5", title: "Press kit", status: "draft", updatedAgo: "1d" },
];

export const ACTIVATION_TASKS = [
  { id: "add-talent", label: "Add your first talent", drawer: "new-talent" as DrawerId },
  { id: "publish", label: "Publish a profile", drawer: "talent-profile" as DrawerId },
  { id: "share-url", label: "Share your workspace URL", drawer: null },
  { id: "invite-team", label: "Invite a teammate (optional)", drawer: "team" as DrawerId },
];

// ─── Workspace info ──────────────────────────────────────────────────

export const TENANT = {
  slug: "acme-models",
  name: "Acme Models",
  domain: "acme-models.tulala.app",
  customDomain: "acme-models.com",
  initials: "A",
};

// ─── Provider ────────────────────────────────────────────────────────

type Toast = { id: number; message: string };

export type ProtoState = {
  surface: Surface;
  plan: Plan;
  role: Role;
  alsoTalent: boolean;
  page: WorkspacePage;
  drawer: DrawerContext;
  upgrade: UpgradeOffer;
  toasts: Toast[];
  completedTasks: Set<string>;
};

type Ctx = {
  state: ProtoState;
  setSurface: (s: Surface) => void;
  setPlan: (p: Plan) => void;
  setRole: (r: Role) => void;
  setAlsoTalent: (b: boolean) => void;
  setPage: (p: WorkspacePage) => void;
  openDrawer: (id: DrawerId, payload?: Record<string, unknown>) => void;
  closeDrawer: () => void;
  openUpgrade: (offer: Omit<UpgradeOffer, "open">) => void;
  closeUpgrade: () => void;
  toast: (message: string) => void;
  completeTask: (id: string) => void;
};

const ProtoContext = createContext<Ctx | null>(null);

export function ProtoProvider({ children }: { children: ReactNode }) {
  const [surface, setSurface] = useState<Surface>("workspace");
  const [plan, setPlan] = useState<Plan>("free");
  const [role, setRole] = useState<Role>("owner");
  const [alsoTalent, setAlsoTalent] = useState<boolean>(true);
  const [page, setPage] = useState<WorkspacePage>("overview");
  const [drawer, setDrawer] = useState<DrawerContext>({ drawerId: null });
  const [upgrade, setUpgrade] = useState<UpgradeOffer>({ open: false });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const toastIdRef = useRef(0);

  // Read initial state from URL hash on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("surface");
    const pl = params.get("plan");
    const r = params.get("role");
    const at = params.get("alsoTalent");
    const pg = params.get("page");
    if (s && SURFACES.includes(s as Surface)) setSurface(s as Surface);
    if (pl && PLANS.includes(pl as Plan)) setPlan(pl as Plan);
    if (r && ROLES.includes(r as Role)) setRole(r as Role);
    if (at === "true" || at === "false") setAlsoTalent(at === "true");
    if (pg && WORKSPACE_PAGES.includes(pg as WorkspacePage)) setPage(pg as WorkspacePage);
  }, []);

  // Persist state to URL (replace, not push)
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("surface", surface);
    if (surface === "workspace") {
      params.set("plan", plan);
      params.set("role", role);
      params.set("alsoTalent", String(alsoTalent));
      params.set("page", page);
    }
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", next);
  }, [surface, plan, role, alsoTalent, page]);

  const openDrawer = useCallback(
    (id: DrawerId, payload?: Record<string, unknown>) => {
      setDrawer({ drawerId: id, payload });
    },
    [],
  );
  const closeDrawer = useCallback(() => {
    setDrawer({ drawerId: null });
  }, []);

  const openUpgrade = useCallback((offer: Omit<UpgradeOffer, "open">) => {
    setUpgrade({ open: true, ...offer });
  }, []);
  const closeUpgrade = useCallback(() => {
    setUpgrade({ open: false });
  }, []);

  const toast = useCallback((message: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2400);
  }, []);

  const completeTask = useCallback((id: string) => {
    setCompletedTasks((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // When surface changes, reset to a sensible default page
  const handleSetSurface = useCallback((s: Surface) => {
    setSurface(s);
    if (s === "workspace") setPage("overview");
    setDrawer({ drawerId: null });
  }, []);

  const value: Ctx = useMemo(
    () => ({
      state: { surface, plan, role, alsoTalent, page, drawer, upgrade, toasts, completedTasks },
      setSurface: handleSetSurface,
      setPlan,
      setRole,
      setAlsoTalent,
      setPage,
      openDrawer,
      closeDrawer,
      openUpgrade,
      closeUpgrade,
      toast,
      completeTask,
    }),
    [
      surface,
      plan,
      role,
      alsoTalent,
      page,
      drawer,
      upgrade,
      toasts,
      completedTasks,
      handleSetSurface,
      openDrawer,
      closeDrawer,
      openUpgrade,
      closeUpgrade,
      toast,
      completeTask,
    ],
  );

  return <ProtoContext.Provider value={value}>{children}</ProtoContext.Provider>;
}

export function useProto(): Ctx {
  const v = useContext(ProtoContext);
  if (!v) throw new Error("useProto outside ProtoProvider");
  return v;
}

// ─── Helpers ─────────────────────────────────────────────────────────

export function getRoster(plan: Plan): TalentProfile[] {
  return plan === "free" ? ROSTER_FREE : ROSTER_AGENCY;
}

export function getInquiries(plan: Plan): Inquiry[] {
  return plan === "free" ? INQUIRIES_FREE : INQUIRIES_AGENCY;
}

export function getClients(plan: Plan): Client[] {
  return plan === "free" ? CLIENTS_FREE : CLIENTS_AGENCY;
}

export function getTeam(plan: Plan): TeamMember[] {
  return plan === "free" ? TEAM_FREE : TEAM_AGENCY;
}

// Visual tokens used by both _primitives and _pages and _drawers
export const COLORS = {
  surface: "#FAFAF7",
  card: "#FFFFFF",
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  inkDim: "rgba(11,11,13,0.38)",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  cream: "#F5F2EB",
  goldDeep: "#8B6308",
  gold: "#B8860B",
  goldSoft: "rgba(184,134,11,0.10)",
  green: "#2E7D5B",
  amber: "#C68A1E",
  red: "#B0303A",
  navyBg: "#0B0B0D",
};

export const FONTS = {
  display: '"Cormorant Garamond", "EB Garamond", Georgia, serif',
  body: '"Inter", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
};
