"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Edit3, MoreHorizontal } from "lucide-react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import {
  DrawerActionBar,
  DrawerCallout,
  DrawerEmpty,
  DrawerGhostButton,
  DrawerLockNote,
  DrawerPrimaryButton,
  DrawerSection,
} from "@/components/admin/drawer/drawer-pieces";
import {
  DRAWER_INPUT_CLASS,
  DRAWER_TEXTAREA_CLASS,
  DrawerItemRow,
  DrawerQActions,
  DrawerQField,
  DrawerQToggle,
  DrawerRowAction,
} from "@/components/admin/drawer/drawer-item-row";

import type { Plan } from "./capability-catalog";

/** Real Branding drawer (Free tier — every plan). Quick-edit form. */
export function BrandingDrawerBody() {
  const t = useT();
  return (
    <div className="space-y-4">
      <DrawerCallout>
        <strong>{t("dashboard.adminSiteControl.branding.calloutLead")}</strong>{" "}
        {t("dashboard.adminSiteControl.branding.calloutBody")}
      </DrawerCallout>

      <DrawerSection title={t("dashboard.adminSiteControl.branding.identity")}>
        <DrawerQField label={t("dashboard.adminSiteControl.branding.workspaceName")}>
          <input className={DRAWER_INPUT_CLASS} defaultValue="Tulala" />
        </DrawerQField>
        <DrawerQField label={t("dashboard.adminSiteControl.branding.tagline")}>
          <input
            className={DRAWER_INPUT_CLASS}
            placeholder={t("dashboard.adminSiteControl.branding.taglinePlaceholder")}
          />
        </DrawerQField>
      </DrawerSection>

      <DrawerSection title={t("dashboard.adminWorkspace.brandingUnlock1")}>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-3 text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-lg border border-border/60 bg-background text-[10px] font-semibold text-muted-foreground">
              LOGO
            </div>
            <DrawerGhostButton>
              {t("dashboard.adminSiteControl.branding.uploadLogo")}
            </DrawerGhostButton>
          </div>
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-3 text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-md border border-border/60 bg-background text-[10px] font-semibold text-muted-foreground">
              ICO
            </div>
            <DrawerGhostButton>
              {t("dashboard.adminSiteControl.branding.uploadFavicon")}
            </DrawerGhostButton>
          </div>
        </div>
      </DrawerSection>

      <DrawerSection title={t("dashboard.adminSiteControl.branding.palette")}>
        <div className="grid grid-cols-3 gap-2">
          <DrawerQField label={t("dashboard.adminSiteControl.branding.colorPrimary")}>
            <input className={DRAWER_INPUT_CLASS} defaultValue="#B8860B" />
          </DrawerQField>
          <DrawerQField label={t("dashboard.adminSiteControl.branding.colorForeground")}>
            <input className={DRAWER_INPUT_CLASS} defaultValue="#0B0B0D" />
          </DrawerQField>
          <DrawerQField label={t("dashboard.adminSiteControl.branding.colorBackground")}>
            <input className={DRAWER_INPUT_CLASS} defaultValue="#FAFAF7" />
          </DrawerQField>
        </div>
      </DrawerSection>

      <DrawerSection title={t("dashboard.adminSiteControl.branding.typography")}>
        <DrawerQField label={t("dashboard.adminSiteControl.branding.displayFont")}>
          <select className={DRAWER_INPUT_CLASS} defaultValue="Cormorant">
            <option>Cormorant</option>
            <option>Playfair Display</option>
            <option>Lora</option>
            <option>EB Garamond</option>
          </select>
        </DrawerQField>
        <DrawerQField label={t("dashboard.adminSiteControl.branding.bodyFont")}>
          <select className={DRAWER_INPUT_CLASS} defaultValue="Inter">
            <option>Inter</option>
            <option>Manrope</option>
            <option>IBM Plex Sans</option>
            <option value="System sans">
              {t("dashboard.adminSiteControl.branding.systemSans")}
            </option>
          </select>
        </DrawerQField>
      </DrawerSection>

      <DrawerQActions>
        <DrawerPrimaryButton>
          {t("dashboard.adminSiteControl.branding.save")}
        </DrawerPrimaryButton>
      </DrawerQActions>
    </div>
  );
}

/** Roster drawer — quick links + summary. */
export function RosterDrawerBody() {
  const t = useT();
  return (
    <div className="space-y-4">
      <DrawerCallout>
        {t("dashboard.adminSiteControl.roster.callout")}
      </DrawerCallout>

      <DrawerActionBar
        primary={
          <DrawerPrimaryButton>
            {t("dashboard.adminSiteControl.roster.add")}
          </DrawerPrimaryButton>
        }
        searchPlaceholder={t("dashboard.adminSiteControl.roster.searchPlaceholder")}
      />

      <DrawerSection>
        <DrawerEmpty>
          {t("dashboard.adminSiteControl.roster.empty")}
        </DrawerEmpty>
      </DrawerSection>

      <DrawerQActions>
        <Link
          href="/admin/talent"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground underline-offset-2 hover:underline"
        >
          {t("dashboard.adminSiteControl.roster.openFull")}
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </DrawerQActions>
    </div>
  );
}

/** Directory settings drawer. */
export function DirectoryDrawerBody() {
  const t = useT();
  return (
    <div className="space-y-4">
      <DrawerCallout>
        {t("dashboard.adminSiteControl.directory.calloutIntro")}{" "}
        <strong>{t("dashboard.adminSiteControl.directory.calloutRendering")}</strong>{" "}
        {t("dashboard.adminSiteControl.directory.calloutRenderingNote")}{" "}
        <strong>{t("dashboard.adminSiteControl.directory.calloutTemplates")}</strong>{" "}
        {t("dashboard.adminSiteControl.directory.calloutTemplatesNote")}{" "}
        <strong>{t("dashboard.adminSiteControl.directory.calloutFields")}</strong>{" "}
        {t("dashboard.adminSiteControl.directory.calloutFieldsNote")}
      </DrawerCallout>

      <DrawerSection title={t("dashboard.adminSiteControl.directory.rendering")}>
        <DrawerQField label={t("dashboard.adminSiteControl.directory.profileMode")}>
          <select className={DRAWER_INPUT_CLASS} defaultValue="dedicated">
            <option value="dedicated">
              {t("dashboard.adminSiteControl.directory.modeDedicated")}
            </option>
            <option value="modal">
              {t("dashboard.adminSiteControl.directory.modeModal")}
            </option>
          </select>
        </DrawerQField>
        <DrawerQField label={t("dashboard.adminSiteControl.directory.layout")}>
          <select className={DRAWER_INPUT_CLASS} defaultValue="grid">
            <option value="grid">
              {t("dashboard.adminSiteControl.directory.layoutGrid")}
            </option>
            <option value="list">
              {t("dashboard.adminSiteControl.directory.layoutList")}
            </option>
            <option value="masonry">
              {t("dashboard.adminSiteControl.directory.layoutMasonry")}
            </option>
          </select>
        </DrawerQField>
      </DrawerSection>

      <DrawerSection title={t("dashboard.adminSiteControl.directory.cardContent")}>
        <div className="space-y-1.5">
          <DrawerQToggle
            label={t("dashboard.adminSiteControl.directory.showName")}
            defaultChecked
          />
          <DrawerQToggle
            label={t("dashboard.adminSiteControl.directory.showProfileType")}
            defaultChecked
          />
          <DrawerQToggle
            label={t("dashboard.adminSiteControl.directory.showCity")}
            defaultChecked
          />
          <DrawerQToggle
            label={t("dashboard.adminSiteControl.directory.showExperience")}
          />
        </div>
      </DrawerSection>

      <DrawerQActions>
        <Link
          href="/admin/directory/filters"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground underline-offset-2 hover:underline"
        >
          {t("dashboard.adminSiteControl.directory.advanced")}
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
        <DrawerPrimaryButton>
          {t("dashboard.adminSiteControl.common.save")}
        </DrawerPrimaryButton>
      </DrawerQActions>
    </div>
  );
}

/** Inquiries drawer — quick summary + link to inbox. */
export function InquiriesDrawerBody() {
  const t = useT();
  return (
    <div className="space-y-4">
      <DrawerCallout>
        {t("dashboard.adminSiteControl.inquiries.callout")}
      </DrawerCallout>

      <DrawerSection>
        <DrawerEmpty>
          {t("dashboard.adminSiteControl.inquiries.empty")}
        </DrawerEmpty>
      </DrawerSection>

      <DrawerQActions>
        <Link
          href="/admin/inquiries"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground underline-offset-2 hover:underline"
        >
          {t("dashboard.adminSiteControl.inquiries.openInbox")}
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </DrawerQActions>
    </div>
  );
}

/** Activity drawer — recent events. */
export function ActivityDrawerBody() {
  const t = useT();
  return (
    <div className="space-y-4">
      <DrawerCallout>
        {t("dashboard.adminSiteControl.activity.callout")}
      </DrawerCallout>
      <DrawerSection>
        <DrawerEmpty>
          {t("dashboard.adminSiteControl.activity.emptyBefore")}{" "}
          <code>/admin/site-settings/audit</code>
          {t("dashboard.adminSiteControl.activity.emptyAfter")}
        </DrawerEmpty>
      </DrawerSection>
    </div>
  );
}

/** Pages drawer — exemplar item-row pattern from the mockup. */
type PageItem = {
  id: string;
  title: string;
  slug: string;
  status: "live" | "draft";
  visibility: "public" | "hidden";
  seo?: string;
};

const PAGES: PageItem[] = [
  { id: "home", title: "Home", slug: "/", status: "live", visibility: "public", seo: "Tulala · every story, one home" },
  { id: "about", title: "About", slug: "/about", status: "live", visibility: "public", seo: "About Tulala" },
  { id: "services", title: "Services", slug: "/services", status: "draft", visibility: "public" },
  { id: "team", title: "Team", slug: "/team", status: "live", visibility: "public", seo: "Our team" },
  { id: "contact", title: "Contact", slug: "/contact", status: "live", visibility: "public", seo: "Get in touch" },
  { id: "press", title: "Press kit", slug: "/press", status: "draft", visibility: "hidden" },
];

/** Localize the sample page/post rows. Ids are stable; only the display
 *  title + SEO line are swapped for the catalog copy. */
function localizeItems(
  items: PageItem[],
  ns: string,
  t: (key: string) => string,
): PageItem[] {
  return items.map((item) => {
    const title = t(`${ns}.${item.id}.title`);
    const seoKey = `${ns}.${item.id}.seo`;
    const seo = item.seo ? t(seoKey) : undefined;
    return {
      ...item,
      title: title === `${ns}.${item.id}.title` ? item.title : title,
      seo: seo === seoKey ? item.seo : seo,
    };
  });
}

export function PagesDrawerBody() {
  const t = useT();
  const [search, setSearch] = React.useState("");
  const pages = localizeItems(PAGES, "dashboard.adminSiteControl.pages.items", t);
  const filtered = pages.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-3">
      <DrawerActionBar
        primary={
          <DrawerPrimaryButton>
            {t("dashboard.adminSiteControl.pages.new")}
          </DrawerPrimaryButton>
        }
        searchPlaceholder={t("dashboard.adminSiteControl.pages.searchPlaceholder")}
        searchValue={search}
        onSearchChange={setSearch}
      />
      <DrawerCallout>
        <strong>{t("dashboard.adminSiteControl.pages.tipLead")}</strong>{" "}
        {t("dashboard.adminSiteControl.pages.tipBody")}
      </DrawerCallout>
      <div className="space-y-1.5">
        {filtered.map((page) => (
          <DrawerItemRow
            key={page.id}
            title={page.title}
            slug={page.slug}
            status={page.status}
            customStatus={{
              label:
                page.status === "live"
                  ? t("dashboard.adminSite.pageStatus.published")
                  : t("dashboard.adminSite.pageStatus.draft"),
            }}
            actions={
              <>
                <DrawerRowAction
                  label={t("dashboard.adminSiteControl.common.editInCanvas")}
                >
                  <Edit3 className="size-3.5" aria-hidden />
                </DrawerRowAction>
                <DrawerRowAction label={t("dashboard.adminSiteControl.common.more")}>
                  <MoreHorizontal className="size-3.5" aria-hidden />
                </DrawerRowAction>
              </>
            }
            quickEdit={
              <PageQuickEdit page={page} />
            }
          />
        ))}
        {filtered.length === 0 ? (
          <DrawerEmpty>
            {interpolate(t("dashboard.adminSiteControl.pages.noMatch"), {
              query: search,
            })}
          </DrawerEmpty>
        ) : null}
      </div>
    </div>
  );
}

function PageQuickEdit({ page }: { page: PageItem }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <DrawerQField label={t("dashboard.adminSiteControl.quickEdit.title")}>
          <input className={DRAWER_INPUT_CLASS} defaultValue={page.title} />
        </DrawerQField>
        <DrawerQField label={t("dashboard.adminSiteControl.quickEdit.url")}>
          <input className={DRAWER_INPUT_CLASS} defaultValue={page.slug} />
        </DrawerQField>
        <DrawerQField label={t("dashboard.adminSiteControl.quickEdit.status")}>
          <select className={DRAWER_INPUT_CLASS} defaultValue={page.status}>
            <option value="draft">{t("dashboard.adminSite.pageStatus.draft")}</option>
            <option value="live">
              {t("dashboard.adminSite.pageStatus.published")}
            </option>
          </select>
        </DrawerQField>
        <DrawerQField label={t("dashboard.adminSiteControl.quickEdit.seoMeta")}>
          <input
            className={DRAWER_INPUT_CLASS}
            defaultValue={page.seo ?? ""}
            placeholder={t("dashboard.adminSiteControl.quickEdit.seoPlaceholder")}
          />
        </DrawerQField>
      </div>
      <div className="flex flex-wrap gap-3 pt-1">
        <DrawerQToggle
          label={t("dashboard.adminSiteControl.quickEdit.public")}
          defaultChecked={page.visibility === "public"}
        />
        <DrawerQToggle
          label={t("dashboard.adminSiteControl.quickEdit.inSitemap")}
          defaultChecked
        />
        <DrawerQToggle label={t("dashboard.adminSiteControl.quickEdit.inMainNav")} />
      </div>
      <DrawerQActions>
        <DrawerGhostButton>
          {t("dashboard.adminSiteControl.quickEdit.openInCanvas")}
        </DrawerGhostButton>
        <DrawerPrimaryButton>
          {t("dashboard.adminSiteControl.common.save")}
        </DrawerPrimaryButton>
      </DrawerQActions>
    </div>
  );
}

/** Posts drawer — same pattern as Pages. */
const POSTS: PageItem[] = [
  { id: "soho", title: "Sofia M walks SoHo show", slug: "/posts/sofia-m-soho", status: "live", visibility: "public", seo: "Sofia M · runway report" },
  { id: "fall", title: "Fall editorial · preview", slug: "/posts/fall-preview", status: "draft", visibility: "public" },
  { id: "launch", title: "Why we joined Tulala", slug: "/posts/joining", status: "live", visibility: "public" },
];

export function PostsDrawerBody() {
  const t = useT();
  const [search, setSearch] = React.useState("");
  const posts = localizeItems(POSTS, "dashboard.adminSiteControl.posts.items", t);
  const filtered = posts.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-3">
      <DrawerActionBar
        primary={
          <DrawerPrimaryButton>
            {t("dashboard.adminSiteControl.posts.write")}
          </DrawerPrimaryButton>
        }
        searchPlaceholder={t("dashboard.adminSiteControl.posts.searchPlaceholder")}
        searchValue={search}
        onSearchChange={setSearch}
      />
      <DrawerCallout>
        <strong>{t("dashboard.adminSiteControl.posts.seoLead")}</strong>{" "}
        {t("dashboard.adminSiteControl.posts.seoBody")}
      </DrawerCallout>
      <div className="space-y-1.5">
        {filtered.map((post) => (
          <DrawerItemRow
            key={post.id}
            title={post.title}
            slug={post.slug}
            status={post.status}
            customStatus={{
              label:
                post.status === "live"
                  ? t("dashboard.adminSite.pageStatus.published")
                  : t("dashboard.adminSite.pageStatus.draft"),
            }}
            actions={
              <>
                <DrawerRowAction
                  label={t("dashboard.adminSiteControl.common.editInCanvas")}
                >
                  <Edit3 className="size-3.5" aria-hidden />
                </DrawerRowAction>
                <DrawerRowAction label={t("dashboard.adminSiteControl.common.more")}>
                  <MoreHorizontal className="size-3.5" aria-hidden />
                </DrawerRowAction>
              </>
            }
            quickEdit={<PageQuickEdit page={post} />}
          />
        ))}
        {filtered.length === 0 ? (
          <DrawerEmpty>
            {interpolate(t("dashboard.adminSiteControl.posts.noMatch"), {
              query: search,
            })}
          </DrawerEmpty>
        ) : null}
      </div>
    </div>
  );
}

/** Generic stub — used for capabilities whose rich UI lives elsewhere. */
export function StubDrawerBody({
  body,
  legacyHref,
  setupHref,
}: {
  body: React.ReactNode;
  legacyHref?: string;
  /**
   * When set, renders a prominent primary CTA pointing at the unified
   * `/admin/site/setup/<id>` surface. The `legacyHref` link still appears
   * as a secondary link beneath it.
   */
  setupHref?: string;
}) {
  const t = useT();
  return (
    <div className="space-y-4">
      <DrawerCallout>{body}</DrawerCallout>
      {setupHref ? (
        <a
          href={setupHref}
          className="group flex items-center justify-between gap-3 rounded-xl border border-[rgba(201,162,39,0.45)] bg-[linear-gradient(180deg,#fffdf6,#fbf6e6)] px-4 py-3 text-foreground transition-colors hover:border-[rgba(201,162,39,0.75)]"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">
              {t("dashboard.adminSite.openSetup")}
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {t("dashboard.adminSiteControl.stub.setupBody")}
            </p>
          </div>
          <ArrowUpRight
            className="size-4 shrink-0 text-foreground/70 transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-foreground"
            aria-hidden
          />
        </a>
      ) : null}
      {legacyHref ? (
        <DrawerQActions>
          <a
            href={legacyHref}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("dashboard.adminSiteControl.stub.openLegacy")}
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        </DrawerQActions>
      ) : null}
    </div>
  );
}

/** Locked-tier drawer body — pitch + plan picker link. */
export function LockedDrawerBody({
  tier,
  copy,
  activePlan,
  onUpgrade,
}: {
  tier: Plan;
  copy: string;
  activePlan: Plan;
  onUpgrade?: () => void;
}) {
  const t = useT();
  const tierLabel =
    tier === "studio" ? "Studio" : tier === "agency" ? "Agency" : "Network";
  return (
    <div className="space-y-4">
      <DrawerLockNote tier={tierLabel}>{copy}</DrawerLockNote>
      <DrawerCallout>
        {t("dashboard.adminSiteControl.locked.calloutIntro")}{" "}
        {t("dashboard.adminSiteControl.locked.youAreOn")}{" "}
        <strong>{activePlan === "free" ? "Free" : activePlan === "studio" ? "Studio" : activePlan === "agency" ? "Agency" : "Network"}</strong>.
      </DrawerCallout>
      <DrawerQActions>
        <button
          type="button"
          onClick={onUpgrade}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground underline-offset-2 hover:underline"
        >
          {tier === "network"
            ? t("dashboard.adminSiteControl.locked.contactUs")
            : t("dashboard.adminSiteControl.locked.comparePlansArrow")}
        </button>
        <DrawerPrimaryButton onClick={onUpgrade}>
          {tier === "network"
            ? t("dashboard.adminSite.contactSales")
            : interpolate(t("dashboard.adminSiteControl.locked.upgradeTo"), {
                tier: tierLabel,
              })}
        </DrawerPrimaryButton>
      </DrawerQActions>
    </div>
  );
}
