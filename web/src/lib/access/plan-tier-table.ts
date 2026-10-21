/**
 * plan-tier-table.ts — the APPROVED tier table (TUL-839, Oran 2026-10-14,
 * "can change later"). The feature half of the plan catalog: names and prices
 * live in `plan-catalog.ts`; this file says which features each tier sells,
 * in EN + ES, which one is "most popular", and which code gate (if any)
 * enforces each feature.
 *
 * Every /pricing card bullet for a mapped tier reads from here
 * (`tierFeatureBullets`), so the page can never advertise a list that differs
 * from this table.
 *
 * GATES ARE NEVER INVENTED. A feature points at an existing entitlement or
 * capability key only when code already checks it. Everything else is
 * `{ kind: "none" }`: either `ungated` (every plan has it, by design) or `gap`
 * (sold by the table, but nothing in code enforces or builds it yet).
 *
 * PURE: no `server-only`, no Supabase. Type-only imports.
 */
import type { CapabilityKey } from "./capabilities";
import type { PlanKey } from "./plan-catalog";
import type { TalentEntitlement } from "./talent-entitlements";

export type TierFeatureGate =
  /** Enforced by `hasEntitlement(plan, key)` (talent plans). */
  | { kind: "talent"; key: TalentEntitlement }
  /** Enforced by `authorize()` + `plan_capabilities` (workspace plans; fail-open by default). */
  | { kind: "workspace"; key: CapabilityKey }
  /** Not plan-gated: `ungated` = everyone has it; `gap` = sold but not enforced/built yet. */
  | { kind: "none"; reason: "ungated" | "gap" };

export type TierFeature = {
  id: string;
  en: string;
  es: string;
  gate: TierFeatureGate;
};

export type TierLadder = "person" | "business";

export type TierRow = {
  planKey: PlanKey;
  ladder: TierLadder;
  mostPopular: boolean;
  /** The tier whose features this one includes ("Everything in X"). */
  includes: PlanKey | null;
  /** Features this tier ADDS over `includes`. */
  features: readonly TierFeature[];
};

const talent = (key: TalentEntitlement): TierFeatureGate => ({ kind: "talent", key });
const workspace = (key: CapabilityKey): TierFeatureGate => ({ kind: "workspace", key });
const UNGATED: TierFeatureGate = { kind: "none", reason: "ungated" };
const GAP: TierFeatureGate = { kind: "none", reason: "gap" };

export const APPROVED_TIER_TABLE: readonly TierRow[] = [
  {
    planKey: "talent_basic",
    ladder: "person",
    mostPopular: false,
    includes: null,
    features: [
      { id: "live_site", en: "Instant live site, ready-made layout", es: "Sitio en vivo al instante, con diseño listo", gate: talent("personalSitePublish") },
      { id: "services_catalog", en: "Services catalog", es: "Catálogo de servicios", gate: UNGATED },
      { id: "booking", en: "Booking", es: "Reservas", gate: UNGATED },
      { id: "chat", en: "Chat with clients", es: "Chat con clientes", gate: UNGATED },
      { id: "payments", en: "Payments (+1.5% client fee)", es: "Pagos (+1.5% de cargo al cliente)", gate: UNGATED },
      { id: "subdomain", en: "Tulala subdomain", es: "Subdominio de Tulala", gate: UNGATED },
      { id: "basic_seo", en: "Basic SEO (title and description)", es: "SEO básico (título y descripción)", gate: UNGATED },
    ],
  },
  {
    planKey: "talent_pro",
    ladder: "person",
    mostPopular: false,
    includes: "talent_basic",
    features: [
      { id: "no_badge", en: "No Tulala badge", es: "Sin sello de Tulala", gate: talent("profile.noPlatformBadge") },
      { id: "premium_themes", en: "Premium themes and card styles", es: "Temas y estilos de tarjeta premium", gate: talent("personalSiteTemplate") },
      { id: "social_links", en: "Social and WhatsApp links", es: "Enlaces a redes y WhatsApp", gate: talent("profile.socialLinks") },
      { id: "reviews_showcase", en: "Reviews showcase", es: "Vitrina de reseñas", gate: GAP },
      { id: "basic_stats", en: "Basic stats", es: "Estadísticas básicas", gate: GAP },
    ],
  },
  {
    planKey: "talent_portfolio",
    ladder: "person",
    mostPopular: true,
    includes: "talent_pro",
    features: [
      { id: "sections", en: "Add and move sections", es: "Agrega y mueve secciones", gate: talent("personalSiteSections") },
      { id: "page_seo", en: "SEO for every page", es: "SEO para cada página", gate: talent("personalSiteSeo") },
      { id: "custom_domain", en: "Custom domain", es: "Dominio propio", gate: talent("personalSiteCustomDomain") },
      { id: "instagram_feed", en: "Instagram feed", es: "Feed de Instagram", gate: GAP },
      // `app-plan-gate.ts` gates premium apps on `personalSiteSections`.
      { id: "premium_apps", en: "Premium apps (Nail Designer and more)", es: "Apps premium (Nail Designer y más)", gate: talent("personalSiteSections") },
      { id: "ai_assistant", en: "AI booking assistant (Lala Bot)", es: "Asistente de reservas con IA (Lala Bot)", gate: talent("ai.paidCredits") },
      { id: "advanced_stats", en: "Advanced stats", es: "Estadísticas avanzadas", gate: talent("personalSiteAnalytics") },
    ],
  },
  {
    planKey: "studio",
    ladder: "business",
    mostPopular: false,
    includes: "talent_portfolio",
    features: [
      { id: "team_seats", en: "Team seats", es: "Lugares para tu equipo", gate: workspace("manage_memberships") },
      { id: "shared_calendar", en: "Shared calendar", es: "Calendario compartido", gate: GAP },
      { id: "roster", en: "Talent roster", es: "Catálogo de talento", gate: workspace("manage_talent_roster") },
      { id: "branded_login", en: "Branded client login", es: "Acceso de clientes con tu marca", gate: GAP },
      { id: "priority_support", en: "Priority support", es: "Soporte prioritario", gate: GAP },
    ],
  },
  {
    planKey: "agency",
    ladder: "business",
    mostPopular: false,
    includes: "studio",
    features: [
      { id: "business_site", en: "Business website", es: "Sitio web del negocio", gate: workspace("edit_cms_pages") },
      { id: "managed_talents", en: "Managed talents", es: "Talentos gestionados", gate: workspace("edit_talent_overlay") },
      { id: "directory_listing", en: "Directory listing", es: "Presencia en el directorio", gate: workspace("submit_hub_visibility") },
      { id: "higher_ai", en: "Higher AI quotas", es: "Más cuota de IA", gate: GAP },
      { id: "admin_roles", en: "Admin roles", es: "Roles de administrador", gate: workspace("manage_memberships") },
    ],
  },
];

/**
 * /pricing catalog slug → plan key, per ladder. The DB `product_tiers` slugs
 * predate the plan keys (`max` is Web Office, `hub` is Network).
 */
export const MARKETING_SLUG_TO_PLAN: Readonly<Record<"talent" | "workspace", Readonly<Record<string, PlanKey>>>> = {
  talent: { free: "talent_basic", pro: "talent_pro", max: "talent_portfolio" },
  workspace: { free: "free", website: "website", studio: "studio", agency: "agency", hub: "network" },
};

export function tierRow(planKey: PlanKey): TierRow | null {
  return APPROVED_TIER_TABLE.find((r) => r.planKey === planKey) ?? null;
}

/** Every feature a tier sells, its own plus everything it includes, base tier first. */
export function allTierFeatures(planKey: PlanKey): TierFeature[] {
  const row = tierRow(planKey);
  if (!row) return [];
  return [...(row.includes ? allTierFeatures(row.includes) : []), ...row.features];
}

function isEs(locale: string): boolean {
  return locale.trim().toLowerCase().startsWith("es");
}

/**
 * Card bullets for a tier: "Everything in <lower tier>" first (when it has
 * one), then the features it adds. `includesName` is the lower tier's display
 * name in the same locale, passed in so this stays free of the catalog import.
 */
export function tierFeatureBullets(
  planKey: PlanKey,
  locale: string,
  includesName: (key: PlanKey) => string,
): string[] {
  const row = tierRow(planKey);
  if (!row) return [];
  const es = isEs(locale);
  const own = row.features.map((f) => (es ? f.es : f.en));
  if (!row.includes) return own;
  const name = includesName(row.includes);
  return [es ? `Todo lo de ${name}` : `Everything in ${name}`, ...own];
}
