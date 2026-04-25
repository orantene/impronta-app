"use client";

import * as React from "react";
import { ArrowUpRight, Edit3, MoreHorizontal } from "lucide-react";

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
  return (
    <div className="space-y-4">
      <DrawerCallout>
        <strong>Branding</strong> survives theme changes — your logo, palette,
        and typography stay even when you swap the underlying theme kit.
      </DrawerCallout>

      <DrawerSection title="Identity">
        <DrawerQField label="Workspace name">
          <input className={DRAWER_INPUT_CLASS} defaultValue="Tulala" />
        </DrawerQField>
        <DrawerQField label="Tagline">
          <input
            className={DRAWER_INPUT_CLASS}
            placeholder="One line for headers and meta tags"
          />
        </DrawerQField>
      </DrawerSection>

      <DrawerSection title="Logo & favicon">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-3 text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-lg border border-border/60 bg-background text-[10px] font-semibold text-muted-foreground">
              LOGO
            </div>
            <DrawerGhostButton>Upload logo</DrawerGhostButton>
          </div>
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-3 text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-md border border-border/60 bg-background text-[10px] font-semibold text-muted-foreground">
              ICO
            </div>
            <DrawerGhostButton>Upload favicon</DrawerGhostButton>
          </div>
        </div>
      </DrawerSection>

      <DrawerSection title="Palette">
        <div className="grid grid-cols-3 gap-2">
          <DrawerQField label="Primary">
            <input className={DRAWER_INPUT_CLASS} defaultValue="#B8860B" />
          </DrawerQField>
          <DrawerQField label="Foreground">
            <input className={DRAWER_INPUT_CLASS} defaultValue="#0B0B0D" />
          </DrawerQField>
          <DrawerQField label="Background">
            <input className={DRAWER_INPUT_CLASS} defaultValue="#FAFAF7" />
          </DrawerQField>
        </div>
      </DrawerSection>

      <DrawerSection title="Typography">
        <DrawerQField label="Display font">
          <select className={DRAWER_INPUT_CLASS} defaultValue="Cormorant">
            <option>Cormorant</option>
            <option>Playfair Display</option>
            <option>Lora</option>
            <option>EB Garamond</option>
          </select>
        </DrawerQField>
        <DrawerQField label="Body font">
          <select className={DRAWER_INPUT_CLASS} defaultValue="Inter">
            <option>Inter</option>
            <option>Manrope</option>
            <option>IBM Plex Sans</option>
            <option>System sans</option>
          </select>
        </DrawerQField>
      </DrawerSection>

      <DrawerQActions>
        <DrawerPrimaryButton>Save branding</DrawerPrimaryButton>
      </DrawerQActions>
    </div>
  );
}

/** Roster drawer — quick links + summary. */
export function RosterDrawerBody() {
  return (
    <div className="space-y-4">
      <DrawerCallout>
        Manage every talent on your roster. Add new talents, approve drafts,
        and drag-reorder how they appear in the directory.
      </DrawerCallout>

      <DrawerActionBar
        primary={<DrawerPrimaryButton>+ Add talent</DrawerPrimaryButton>}
        searchPlaceholder="Search talent…"
      />

      <DrawerSection>
        <DrawerEmpty>
          Roster preview not loaded yet — open the full roster page for
          drag-reorder, bulk edits, and approvals.
        </DrawerEmpty>
      </DrawerSection>

      <DrawerQActions>
        <a
          href="/admin/talent"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground underline-offset-2 hover:underline"
        >
          Open full roster
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      </DrawerQActions>
    </div>
  );
}

/** Directory settings drawer. */
export function DirectoryDrawerBody() {
  return (
    <div className="space-y-4">
      <DrawerCallout>
        How your talent directory renders publicly. Three areas:{" "}
        <strong>Rendering</strong> (grid vs dedicated pages),{" "}
        <strong>Templates</strong> (layout family), and{" "}
        <strong>Fields</strong> (which fields show on the card).
      </DrawerCallout>

      <DrawerSection title="Rendering">
        <DrawerQField label="Profile mode">
          <select className={DRAWER_INPUT_CLASS} defaultValue="dedicated">
            <option value="dedicated">Dedicated pages</option>
            <option value="modal">Modal overlay</option>
          </select>
        </DrawerQField>
        <DrawerQField label="Layout">
          <select className={DRAWER_INPUT_CLASS} defaultValue="grid">
            <option value="grid">Grid</option>
            <option value="list">List</option>
            <option value="masonry">Masonry</option>
          </select>
        </DrawerQField>
      </DrawerSection>

      <DrawerSection title="Card content">
        <div className="space-y-1.5">
          <DrawerQToggle label="Show name" defaultChecked />
          <DrawerQToggle label="Show profile type" defaultChecked />
          <DrawerQToggle label="Show city" defaultChecked />
          <DrawerQToggle label="Show experience" />
        </div>
      </DrawerSection>

      <DrawerQActions>
        <a
          href="/admin/directory/filters"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground underline-offset-2 hover:underline"
        >
          Advanced directory settings
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
        <DrawerPrimaryButton>Save</DrawerPrimaryButton>
      </DrawerQActions>
    </div>
  );
}

/** Inquiries drawer — quick summary + link to inbox. */
export function InquiriesDrawerBody() {
  return (
    <div className="space-y-4">
      <DrawerCallout>
        Pipeline at a glance — open requests, in-progress deals, won bookings.
        Detailed responses live in the full inbox.
      </DrawerCallout>

      <DrawerSection>
        <DrawerEmpty>
          Inquiry summary loads in the full inbox view — open it to triage,
          assign, and convert to bookings.
        </DrawerEmpty>
      </DrawerSection>

      <DrawerQActions>
        <a
          href="/admin/inquiries"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground underline-offset-2 hover:underline"
        >
          Open inquiry inbox
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      </DrawerQActions>
    </div>
  );
}

/** Activity drawer — recent events. */
export function ActivityDrawerBody() {
  return (
    <div className="space-y-4">
      <DrawerCallout>
        Recent edits, publishes, and approvals across the workspace.
      </DrawerCallout>
      <DrawerSection>
        <DrawerEmpty>
          Activity feed not loaded yet — full chronological feed with surface
          filters lives at <code>/admin/site-settings/audit</code>.
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
  { id: "home", title: "Home", slug: "/", status: "live", visibility: "public", seo: "Tulala — every story, one home" },
  { id: "about", title: "About", slug: "/about", status: "live", visibility: "public", seo: "About Tulala" },
  { id: "services", title: "Services", slug: "/services", status: "draft", visibility: "public" },
  { id: "team", title: "Team", slug: "/team", status: "live", visibility: "public", seo: "Our team" },
  { id: "contact", title: "Contact", slug: "/contact", status: "live", visibility: "public", seo: "Get in touch" },
  { id: "press", title: "Press kit", slug: "/press", status: "draft", visibility: "hidden" },
];

export function PagesDrawerBody() {
  const [search, setSearch] = React.useState("");
  const filtered = PAGES.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-3">
      <DrawerActionBar
        primary={<DrawerPrimaryButton>+ New page</DrawerPrimaryButton>}
        searchPlaceholder="Search pages…"
        searchValue={search}
        onSearchChange={setSearch}
      />
      <DrawerCallout>
        <strong>Tip.</strong> New pages default to Draft. Publish from the row
        — they go live on your domain instantly.
      </DrawerCallout>
      <div className="space-y-1.5">
        {filtered.map((page) => (
          <DrawerItemRow
            key={page.id}
            title={page.title}
            slug={page.slug}
            status={page.status}
            actions={
              <>
                <DrawerRowAction label="Edit in canvas">
                  <Edit3 className="size-3.5" aria-hidden />
                </DrawerRowAction>
                <DrawerRowAction label="More">
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
          <DrawerEmpty>No pages match &ldquo;{search}&rdquo;.</DrawerEmpty>
        ) : null}
      </div>
    </div>
  );
}

function PageQuickEdit({ page }: { page: PageItem }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <DrawerQField label="Title">
          <input className={DRAWER_INPUT_CLASS} defaultValue={page.title} />
        </DrawerQField>
        <DrawerQField label="URL">
          <input className={DRAWER_INPUT_CLASS} defaultValue={page.slug} />
        </DrawerQField>
        <DrawerQField label="Status">
          <select className={DRAWER_INPUT_CLASS} defaultValue={page.status}>
            <option value="draft">Draft</option>
            <option value="live">Live</option>
          </select>
        </DrawerQField>
        <DrawerQField label="SEO meta">
          <input
            className={DRAWER_INPUT_CLASS}
            defaultValue={page.seo ?? ""}
            placeholder="Title for search engines"
          />
        </DrawerQField>
      </div>
      <div className="flex flex-wrap gap-3 pt-1">
        <DrawerQToggle label="Public" defaultChecked={page.visibility === "public"} />
        <DrawerQToggle label="In sitemap" defaultChecked />
        <DrawerQToggle label="In main nav" />
      </div>
      <DrawerQActions>
        <DrawerGhostButton>Open in canvas →</DrawerGhostButton>
        <DrawerPrimaryButton>Save</DrawerPrimaryButton>
      </DrawerQActions>
    </div>
  );
}

/** Posts drawer — same pattern as Pages. */
const POSTS: PageItem[] = [
  { id: "soho", title: "Sofia M walks SoHo show", slug: "/posts/sofia-m-soho", status: "live", visibility: "public", seo: "Sofia M · runway report" },
  { id: "fall", title: "Fall editorial — preview", slug: "/posts/fall-preview", status: "draft", visibility: "public" },
  { id: "launch", title: "Why we joined Tulala", slug: "/posts/joining", status: "live", visibility: "public" },
];

export function PostsDrawerBody() {
  const [search, setSearch] = React.useState("");
  const filtered = POSTS.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-3">
      <DrawerActionBar
        primary={<DrawerPrimaryButton>+ Write post</DrawerPrimaryButton>}
        searchPlaceholder="Search posts…"
        searchValue={search}
        onSearchChange={setSearch}
      />
      <DrawerCallout>
        <strong>SEO boost.</strong> Posts with a filled-in meta line rank
        ~3× higher. Takes 20 seconds per post to add.
      </DrawerCallout>
      <div className="space-y-1.5">
        {filtered.map((post) => (
          <DrawerItemRow
            key={post.id}
            title={post.title}
            slug={post.slug}
            status={post.status}
            actions={
              <>
                <DrawerRowAction label="Edit in canvas">
                  <Edit3 className="size-3.5" aria-hidden />
                </DrawerRowAction>
                <DrawerRowAction label="More">
                  <MoreHorizontal className="size-3.5" aria-hidden />
                </DrawerRowAction>
              </>
            }
            quickEdit={<PageQuickEdit page={post} />}
          />
        ))}
        {filtered.length === 0 ? (
          <DrawerEmpty>No posts match &ldquo;{search}&rdquo;.</DrawerEmpty>
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
  return (
    <div className="space-y-4">
      <DrawerCallout>{body}</DrawerCallout>
      {setupHref ? (
        <a
          href={setupHref}
          className="group flex items-center justify-between gap-3 rounded-xl border border-[rgba(201,162,39,0.45)] bg-[linear-gradient(180deg,#fffdf6,#fbf6e6)] px-4 py-3 text-foreground transition-colors hover:border-[rgba(201,162,39,0.75)]"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">Open setup</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Premium walkthrough — configure this card with full chrome,
              real status, and one-click apply.
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
            Open legacy editor
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
  const tierLabel =
    tier === "studio" ? "Studio" : tier === "agency" ? "Agency" : "Network";
  return (
    <div className="space-y-4">
      <DrawerLockNote tier={tierLabel}>{copy}</DrawerLockNote>
      <DrawerCallout>
        Every plan runs on the same product — higher tiers unlock more cards.
        You're on <strong>{activePlan === "free" ? "Free" : activePlan === "studio" ? "Studio" : activePlan === "agency" ? "Agency" : "Network"}</strong>.
      </DrawerCallout>
      <DrawerQActions>
        <button
          type="button"
          onClick={onUpgrade}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground underline-offset-2 hover:underline"
        >
          {tier === "network" ? "Contact us" : `Compare plans →`}
        </button>
        <DrawerPrimaryButton onClick={onUpgrade}>
          {tier === "network" ? "Talk to sales" : `Upgrade to ${tierLabel}`}
        </DrawerPrimaryButton>
      </DrawerQActions>
    </div>
  );
}
