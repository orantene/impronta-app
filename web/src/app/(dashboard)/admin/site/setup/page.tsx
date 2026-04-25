import { redirect } from "next/navigation";
import {
  FileText,
  Menu,
  Newspaper,
  Palette,
  Search,
  Sparkles,
  Star,
} from "lucide-react";

import {
  SetupPage,
  SetupSection,
} from "@/components/admin/setup/setup-page";
import {
  SetupStepRow,
  type SetupStepStatus,
} from "@/components/admin/setup/setup-step-row";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { getThemePreset } from "@/lib/site-admin/presets/theme-presets";

export const dynamic = "force-dynamic";

/**
 * /admin/site/setup — the unified Setup hub.
 *
 * Six numbered steps that walk an operator from "fresh agency workspace" to
 * "site ready to publish": Homepage → Pages → Posts → Navigation → Theme →
 * SEO. Each row resolves real data from the workspace so the badge column
 * tells the truth: "Editorial Noir applied", "12 pages · 3 drafts", etc.
 *
 * The hub is intentionally read-only — every action lives one click deep, on
 * the per-step setup page (`/admin/site/setup/<id>`). That keeps this surface
 * fast (one server fetch per step) and easy to scan at a glance.
 */
export default async function SiteSetupHubPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    redirect("/admin?err=no_tenant");
  }

  const tenantId = scope.tenantId;
  const supabase = auth.supabase;

  // Fetch the data each step needs in parallel. Failures degrade gracefully —
  // a step shows "—" status rather than blowing up the whole hub.
  const [
    pagesRes,
    postsRes,
    brandingRes,
    homepageRes,
    headerNavRes,
    footerNavRes,
  ] = await Promise.all([
    supabase
      .from("cms_pages")
      .select("id,status,is_system_owned", { count: "exact" })
      .eq("tenant_id", tenantId),
    supabase
      .from("cms_posts")
      .select("id,status", { count: "exact" })
      .eq("tenant_id", tenantId),
    supabase
      .from("agency_branding")
      .select("theme_preset_slug,theme_published_at")
      .eq("tenant_id", tenantId)
      .maybeSingle<{
        theme_preset_slug: string | null;
        theme_published_at: string | null;
      }>(),
    supabase
      .from("cms_pages")
      .select("id,status,published_at,version")
      .eq("tenant_id", tenantId)
      .eq("is_system_owned", true)
      .eq("system_template_key", "homepage")
      .maybeSingle<{
        id: string;
        status: string | null;
        published_at: string | null;
        version: number | null;
      }>(),
    supabase
      .from("cms_navigation_menus")
      .select("published_at,version")
      .eq("tenant_id", tenantId)
      .eq("zone", "header")
      .eq("locale", "en")
      .maybeSingle<{ published_at: string | null; version: number | null }>(),
    supabase
      .from("cms_navigation_menus")
      .select("published_at,version")
      .eq("tenant_id", tenantId)
      .eq("zone", "footer")
      .eq("locale", "en")
      .maybeSingle<{ published_at: string | null; version: number | null }>(),
  ]);

  // -------- Homepage step --------
  const homepage = homepageRes.data ?? null;
  const homepageStatus: SetupStepStatus = homepage
    ? homepage.status === "published"
      ? "complete"
      : "in_progress"
    : "pending";
  const homepageMeta = homepage
    ? homepage.status === "published"
      ? "Live · published"
      : "Draft pending publish"
    : "Not started";

  // -------- Pages step --------
  const allPages = pagesRes.data ?? [];
  // Exclude the system-owned homepage from the user-pages count — it's its
  // own step, not a generic page.
  const userPages = allPages.filter((p) => !p.is_system_owned);
  const publishedPages = userPages.filter((p) => p.status === "published");
  const draftPages = userPages.filter((p) => p.status !== "published");
  const pagesStatus: SetupStepStatus =
    userPages.length === 0
      ? "pending"
      : publishedPages.length > 0 && draftPages.length === 0
        ? "complete"
        : "in_progress";
  const pagesMeta =
    userPages.length === 0
      ? "No pages yet"
      : `${userPages.length} page${userPages.length === 1 ? "" : "s"}${
          draftPages.length > 0 ? ` · ${draftPages.length} draft` : ""
        }`;

  // -------- Posts step --------
  const allPosts = postsRes.data ?? [];
  const publishedPosts = allPosts.filter((p) => p.status === "published");
  const draftPosts = allPosts.filter((p) => p.status !== "published");
  const postsStatus: SetupStepStatus =
    allPosts.length === 0
      ? "pending"
      : publishedPosts.length > 0
        ? "complete"
        : "in_progress";
  const postsMeta =
    allPosts.length === 0
      ? "No posts yet"
      : `${publishedPosts.length} published${
          draftPosts.length > 0 ? ` · ${draftPosts.length} draft` : ""
        }`;

  // -------- Navigation step --------
  const headerPublished = headerNavRes.data?.published_at != null;
  const footerPublished = footerNavRes.data?.published_at != null;
  const navStatus: SetupStepStatus =
    headerPublished && footerPublished
      ? "complete"
      : headerPublished || footerPublished
        ? "in_progress"
        : "pending";
  const navMeta = (() => {
    const parts: string[] = [];
    parts.push(headerPublished ? "Header live" : "Header pending");
    parts.push(footerPublished ? "Footer live" : "Footer pending");
    return parts.join(" · ");
  })();

  // -------- Theme step --------
  const branding = brandingRes.data ?? null;
  const presetSlug = branding?.theme_preset_slug ?? null;
  const preset = getThemePreset(presetSlug);
  const themeStatus: SetupStepStatus = presetSlug
    ? branding?.theme_published_at
      ? "complete"
      : "in_progress"
    : "pending";
  const themeMeta = preset
    ? branding?.theme_published_at
      ? `${preset.label} applied`
      : `${preset.label} · draft`
    : "No theme picked";

  // -------- SEO step --------
  // Real per-page SEO defaults still live under Identity — surface the step
  // but mark it pending until the dedicated form ships.
  const seoStatus: SetupStepStatus = "pending";
  const seoMeta = "Defaults under Identity";

  // Active step = first one that isn't "complete" (matches the screenshot —
  // amber band on the current focus, neutral on everything else).
  const stepIds = [
    homepageStatus,
    pagesStatus,
    postsStatus,
    navStatus,
    themeStatus,
    seoStatus,
  ];
  const firstIncompleteIdx = stepIds.findIndex((s) => s !== "complete");
  const activeIdx = firstIncompleteIdx === -1 ? -1 : firstIncompleteIdx;

  const completedCount = stepIds.filter((s) => s === "complete").length;
  const totalCount = stepIds.length;

  return (
    <SetupPage
      eyebrow="SETUP"
      title="Get your site live"
      icon={Sparkles}
      description={
        <>
          Six steps to a launched site. Skip around freely — every step links
          to the full surface. Status badges reflect the live state of your
          workspace, so progress is always honest.
        </>
      }
      backHref="/admin/site"
      backLabel="Back to Site"
      headerExtras={
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.18em]"
          style={{
            backgroundColor:
              completedCount === totalCount
                ? "rgba(20,107,58,0.10)"
                : "rgba(201,162,39,0.14)",
            color: completedCount === totalCount ? "#0e4a26" : "#7a5d12",
          }}
        >
          {completedCount} / {totalCount} configured
        </span>
      }
    >
      <SetupSection
        label="Your Agency setup"
        helper="Configured · in progress · needs setup"
      >
        <div className="space-y-2">
          <SetupStepRow
            index={1}
            icon={Star}
            title="Homepage"
            description="Compose the first thing every visitor sees. Sections, hero copy, talent shelves."
            meta={homepageMeta}
            status={homepageStatus}
            href="/admin/site/setup/homepage"
            active={activeIdx === 0}
          />
          <SetupStepRow
            index={2}
            icon={FileText}
            title="Pages"
            description="About, Services, Contact, anything else. Public URLs under /p/…"
            meta={pagesMeta}
            status={pagesStatus}
            href="/admin/site/setup/pages"
            active={activeIdx === 1}
          />
          <SetupStepRow
            index={3}
            icon={Newspaper}
            title="Posts"
            description="Editorial articles, news, runway recaps. Public URLs under /posts/…"
            meta={postsMeta}
            status={postsStatus}
            href="/admin/site/setup/posts"
            active={activeIdx === 2}
          />
          <SetupStepRow
            index={4}
            icon={Menu}
            title="Navigation & Footer"
            description="Header links + footer columns. Two zones, drag-and-drop reordering."
            meta={navMeta}
            status={navStatus}
            href="/admin/site/setup/navigation"
            active={activeIdx === 3}
          />
          <SetupStepRow
            index={5}
            icon={Palette}
            title="Theme & foundations"
            description="Pick a designer kit. Colors, typography, motion, density — the whole system."
            meta={themeMeta}
            status={themeStatus}
            href="/admin/site/setup/theme"
            active={activeIdx === 4}
          />
          <SetupStepRow
            index={6}
            icon={Search}
            title="SEO & defaults"
            description="Default meta title, description, sitemap rules. Per-page overrides land later."
            meta={seoMeta}
            status={seoStatus}
            href="/admin/site/setup/seo"
            active={activeIdx === 5}
          />
        </div>
      </SetupSection>
    </SetupPage>
  );
}
