"use client";

/**
 * EmptyCanvasStarter — first-run canvas surface for tenants with no CMS
 * homepage composed.
 *
 * Implements builder-experience.html surface §18 (Empty canvas — fresh
 * tenant onboarding). Last reconciled: 2026-04-25.
 *
 * Shown only in edit mode on tenants whose homepage has zero sections. The
 * edit-chrome (topbar, inspector dock, overlay portal) still mounts around
 * this card so the operator is in "editing" from first click; they just
 * have nothing to target yet. Without this affordance, clicking Edit on a
 * fresh tenant lands them in an ambiguous state — the chrome looks ready,
 * but there's nothing on the canvas to select.
 *
 * The three recipes mirror the admin composer's starter tiles (editorial,
 * classic, minimal), but this surface lives on the live canvas so the
 * operator never has to leave edit mode. `applyStarterComposition` is the
 * same server action the composer uses — same preset + section seeding +
 * audit trail — so the two paths produce identical state.
 */

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ComponentType,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import {
  addEmptyCanvasHeroAction,
  applyStarterComposition,
  loadStarterAvailability,
  type StarterActionState,
} from "@/lib/site-admin/edit-mode/starter-action";
import {
  resolveEssentialHomeIndexes,
  sectionSourceKind,
  sectionSourceLabel,
  STARTER_STYLE_OPTIONS_BY_TYPE,
} from "@/lib/site-admin/edit-mode/starter-selection";
import { getBuilderPlanPolicy } from "@/lib/site-admin/builder-capabilities";
import type { SectionTypeKey } from "@/lib/site-admin/sections/registry";
import { InfoTip } from "@/components/ui/info-tip";
import {
  WireClassic,
  WireEditorial,
  WireStudioMinimal,
} from "./starter-wireframes";
import { WorkspaceTemplateGallery } from "./WorkspaceTemplateGallery";

export interface RecipeTile {
  slug: string;
  label: string;
  summary: string;
  info: string;
  sections: number;
  category: "featured" | "agency" | "service" | "portfolio" | "food";
  bestFor: string;
  sequence: ReadonlyArray<string>;
  sectionTypeKeys: ReadonlyArray<SectionTypeKey>;
  Wire: ComponentType<{ className?: string }>;
}

function sectionSourceBadgeClass(typeKey: SectionTypeKey): string {
  const source = sectionSourceKind(typeKey);
  if (source === "live-data") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (source === "navigation") {
    return "border-indigo-200 bg-indigo-50 text-indigo-700";
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

function summarizeTemplateSourceKinds(tile: RecipeTile): {
  liveData: number;
  navigation: number;
  starterContent: number;
  homeCore: number;
} {
  let liveData = 0;
  let navigation = 0;
  let starterContent = 0;
  for (const typeKey of tile.sectionTypeKeys) {
    const kind = sectionSourceKind(typeKey);
    if (kind === "live-data") liveData += 1;
    else if (kind === "navigation") navigation += 1;
    else starterContent += 1;
  }
  const homeCore = resolveEssentialHomeIndexes(tile.sectionTypeKeys).length;
  return { liveData, navigation, starterContent, homeCore };
}

export interface TemplateCurrentSectionSummary {
  id: string;
  name: string;
  slotLabel: string;
  typeLabel: string;
}

export const STARTER_TEMPLATE_TILES: RecipeTile[] = [
  {
    slug: "free-quickstart-5",
    label: "Free One-Page",
    summary:
      "Single-page Free launch template — hero, services, featured roster profiles, and final CTA.",
    info: "Built for Free launch speed. Pulls real published profiles from your workspace roster (up to five on Free).",
    sections: 4,
    category: "featured",
    bestFor: "Free roster launch",
    sequence: ["Hero", "Services", "Featured roster", "CTA"],
    sectionTypeKeys: ["hero", "category_grid", "featured_talent", "cta_banner"],
    Wire: WireClassic,
  },
  {
    slug: "home-core-4",
    label: "Home Core 4",
    summary:
      "Fixed homepage core — search hero, browse-by-type, featured talent, and location map.",
    info: "Best base for agency directory homepages. Blends live-data sections with editable copy and layout controls.",
    sections: 4,
    category: "featured",
    bestFor: "Directory-first homepages",
    sequence: ["Search hero", "Browse by type", "Featured talent", "Location map"],
    sectionTypeKeys: ["hero", "category_grid", "featured_talent", "map_overlay"],
    Wire: WireStudioMinimal,
  },
  {
    slug: "editorial-bridal",
    label: "Editorial",
    summary:
      "Full 9-section composition — hero, trust band, services, featured roster, process, destinations, gallery, testimonials, CTA.",
    info: "Ivory canvas, italic-serif display, soft radii. Good fit for wedding collectives, editorial agencies, destination teams.",
    sections: 9,
    category: "featured",
    bestFor: "Editorial agencies",
    sequence: [
      "Hero",
      "Trust band",
      "Services",
      "Roster",
      "Process",
      "Destinations",
      "Gallery",
      "Testimonials",
      "CTA",
    ],
    sectionTypeKeys: [
      "hero",
      "trust_strip",
      "category_grid",
      "featured_talent",
      "process_steps",
      "destinations_mosaic",
      "gallery_strip",
      "testimonials_trio",
      "cta_banner",
    ],
    Wire: WireEditorial,
  },
  {
    slug: "classic",
    label: "Classic",
    summary: "Lean 4-section starter — hero, services, featured roster, final CTA.",
    info: "Platform-neutral defaults. Best when you're migrating from a legacy site and want minimum surface to edit on day one.",
    sections: 4,
    category: "featured",
    bestFor: "Clean migrations",
    sequence: ["Hero", "Services", "Featured roster", "CTA"],
    sectionTypeKeys: ["hero", "category_grid", "featured_talent", "cta_banner"],
    Wire: WireClassic,
  },
  {
    slug: "studio-minimal",
    label: "Studio Minimal",
    summary: "Monochrome, portfolio-forward — hero, services, gallery, CTA.",
    info: "Sharp edges, wide gallery, let the work carry the page. Photography studios, boutique fashion, high-end portfolios.",
    sections: 4,
    category: "portfolio",
    bestFor: "Portfolio studios",
    sequence: ["Hero", "Services", "Gallery", "CTA"],
    sectionTypeKeys: ["hero", "category_grid", "gallery_strip", "cta_banner"],
    Wire: WireStudioMinimal,
  },
  {
    slug: "wedding-photographer",
    label: "Wedding Photographer",
    summary:
      "9-section vertical kit — hero, stats, services, gallery, process, testimonials, pricing grid, FAQ, CTA. Real-feeling copy out of the box.",
    info: "Editorial preset. Showcases the new pricing grid + FAQ + stats sections with copy you can sit on while you edit. Ideal for solo photographers and small studios.",
    sections: 9,
    category: "portfolio",
    bestFor: "Photography sales pages",
    sequence: [
      "Hero",
      "Stats",
      "Services",
      "Gallery",
      "Process",
      "Testimonials",
      "Pricing",
      "FAQ",
      "CTA",
    ],
    sectionTypeKeys: [
      "hero",
      "stats",
      "image_copy_alternating",
      "gallery_strip",
      "process_steps",
      "testimonials_trio",
      "pricing_grid",
      "faq_accordion",
      "cta_banner",
    ],
    Wire: WireEditorial,
  },
  {
    slug: "hair-salon",
    label: "Hair Salon",
    summary:
      "8-section vertical kit — hero, marquee, services, team grid, before/after, testimonials, pricing, CTA.",
    info: "Classic preset. Showcases marquee + team grid + before/after slider with salon-tuned copy and pricing. Ideal for hair, brow, nail, and aesthetics studios.",
    sections: 8,
    category: "service",
    bestFor: "Service menus",
    sequence: [
      "Hero",
      "Marquee",
      "Services",
      "Team",
      "Before/after",
      "Testimonials",
      "Pricing",
      "CTA",
    ],
    sectionTypeKeys: [
      "hero",
      "marquee",
      "category_grid",
      "team_grid",
      "before_after",
      "testimonials_trio",
      "pricing_grid",
      "cta_banner",
    ],
    Wire: WireClassic,
  },
  {
    slug: "talent-agency",
    label: "Talent Agency",
    summary:
      "7-section roster-led kit — hero, press marquee, featured talent, disciplines grid, booking process, stats, CTA.",
    info: "Editorial preset, roster-forward. Best for boutique agencies, talent collectives, and casting houses.",
    sections: 7,
    category: "agency",
    bestFor: "Roster-led agencies",
    sequence: [
      "Hero",
      "Press",
      "Featured talent",
      "Disciplines",
      "Booking process",
      "Stats",
      "CTA",
    ],
    sectionTypeKeys: [
      "hero",
      "marquee",
      "featured_talent",
      "category_grid",
      "process_steps",
      "stats",
      "cta_banner",
    ],
    Wire: WireEditorial,
  },
  {
    slug: "wellness-spa",
    label: "Wellness / Spa",
    summary:
      "6-section service-and-pricing kit — hero, stats, treatments, pricing grid, FAQ, CTA.",
    info: "Studio Minimal preset. Treatment menus + transparent pricing + FAQ-led objection handling. Ideal for facials, massage, sauna, and wellness studios.",
    sections: 6,
    category: "service",
    bestFor: "Wellness offers",
    sequence: ["Hero", "Stats", "Treatments", "Pricing", "FAQ", "CTA"],
    sectionTypeKeys: [
      "hero",
      "stats",
      "image_copy_alternating",
      "pricing_grid",
      "faq_accordion",
      "cta_banner",
    ],
    Wire: WireStudioMinimal,
  },
  {
    slug: "restaurant",
    label: "Restaurant",
    summary:
      "6-section restaurant kit — hero, sticky anchor nav, signature dishes, hours, press, reserve CTA.",
    info: "Studio Minimal preset. Anchor nav stays pinned so guests jump between Menu / Hours / Reserve. Ideal for small dining rooms, cafes, and wine bars.",
    sections: 6,
    category: "food",
    bestFor: "Hospitality pages",
    sequence: ["Hero", "Anchor nav", "Dishes", "Hours", "Press", "Reserve"],
    sectionTypeKeys: [
      "hero",
      "anchor_nav",
      "image_copy_alternating",
      "stats",
      "testimonials_trio",
      "cta_banner",
    ],
    Wire: WireStudioMinimal,
  },
];

export const STARTER_TEMPLATE_CATEGORIES: Array<{
  key: "all" | RecipeTile["category"];
  label: string;
}> = [
  { key: "all", label: "All" },
  { key: "featured", label: "Featured" },
  { key: "agency", label: "Agency" },
  { key: "service", label: "Service" },
  { key: "portfolio", label: "Portfolio" },
  { key: "food", label: "Food" },
];

export function EmptyCanvasStarter({
  locale = "en",
}: {
  locale?: string;
} = {}) {
  const router = useRouter();
  const [state, dispatch, pending] = useActionState<StarterActionState, FormData>(
    applyStarterComposition,
    undefined,
  );
  const [quickInsertPending, startQuickInsert] = useTransition();
  const [allowedSlugs, setAllowedSlugs] = useState<ReadonlySet<string>>(
    new Set(["free-quickstart-5"]),
  );
  const [planTier, setPlanTier] = useState<string | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [quickInsertError, setQuickInsertError] = useState<string | null>(null);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [templateGalleryQuery, setTemplateGalleryQuery] = useState("");
  const [templateGalleryCategory, setTemplateGalleryCategory] =
    useState<(typeof STARTER_TEMPLATE_CATEGORIES)[number]["key"]>("all");
  const [highlightedTemplateSlug, setHighlightedTemplateSlug] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      // Ask EditProvider (which owns composition state) to refresh in
      // place, then only hard-reload as a fallback if no ack arrives.
      let synced = false;
      const onSynced = () => {
        synced = true;
      };
      window.addEventListener("impronta:starter-sync-complete", onSynced);
      window.dispatchEvent(new CustomEvent("impronta:starter-applied"));
      const fallbackTimer = window.setTimeout(() => {
        if (synced) return;
        router.refresh();
        window.location.reload();
      }, 2000);
      return () => {
        window.removeEventListener("impronta:starter-sync-complete", onSynced);
        window.clearTimeout(fallbackTimer);
      };
    }
  }, [state, router]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await loadStarterAvailability();
      if (cancelled) return;
      if (!res.ok) {
        setAvailabilityError(res.error);
        setAvailabilityLoaded(true);
        return;
      }
      setPlanTier(res.plan);
      setAllowedSlugs(new Set(res.allowedSlugs));
      setAvailabilityLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const error = state && !state.ok ? state.error : null;
  const visibleTiles = STARTER_TEMPLATE_TILES.filter((tile) =>
    allowedSlugs.has(tile.slug),
  );
  const planPolicy = getBuilderPlanPolicy(planTier);
  const freePlan = availabilityLoaded && planPolicy.plan === "free";
  const galleryCatalogTiles =
    planPolicy.starterTemplateMode === "free-only"
      ? visibleTiles
      : STARTER_TEMPLATE_TILES;
  const showTemplateGallery =
    availabilityLoaded && !availabilityError && planPolicy.workspaceTemplateLibrary;
  const templateGalleryTiles = useMemo(() => {
    const q = templateGalleryQuery.trim().toLowerCase();
    return galleryCatalogTiles.filter((tile) => {
      if (templateGalleryCategory !== "all" && tile.category !== templateGalleryCategory) {
        return false;
      }
      if (!q) return true;
      return `${tile.label} ${tile.summary} ${tile.info} ${tile.category} ${tile.bestFor} ${tile.sequence.join(" ")}`
        .toLowerCase()
        .includes(q);
    });
  }, [galleryCatalogTiles, templateGalleryCategory, templateGalleryQuery]);

  function openTemplateGallery(slug?: string) {
    setHighlightedTemplateSlug(slug ?? null);
    setTemplateGalleryOpen(true);
  }

  function handleQuickHeroInsert() {
    setQuickInsertError(null);
    startQuickInsert(async () => {
      const formData = new FormData();
      formData.set("locale", locale);
      const result = await addEmptyCanvasHeroAction(undefined, formData);
      if (!result?.ok) {
        setQuickInsertError(result?.error ?? "Couldn't add the hero section.");
        return;
      }
      router.refresh();
      window.location.assign(window.location.href);
    });
  }

  return (
    <div
      data-builder-selector-surface
      className="mx-auto my-16 w-full max-w-3xl px-6"
    >
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.25),0_2px_0_rgba(0,0,0,0.04)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          Start here
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
          Your homepage is a blank canvas.
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600">
          Pick a starter to seed real sections you can rewrite, reorder, and
          restyle inline. Nothing goes live until you click Publish — you&apos;re
          only ever editing a draft.
        </p>

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        ) : null}
        {quickInsertError ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {quickInsertError}
          </div>
        ) : null}

        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-xl">
              <h3 className="text-sm font-semibold text-zinc-900">
                Build from scratch
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                For Impronta QA, start empty and add one real section at a time.
                Add the hero first, then use the live canvas and navigator to
                test deeper parent/child flows one by one.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <button
              type="button"
              data-empty-canvas-quick-add="hero"
              disabled={pending || quickInsertPending}
              onClick={handleQuickHeroInsert}
              className="flex min-h-[92px] w-full flex-col items-start justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left transition hover:border-indigo-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex w-full items-center justify-between gap-3">
                <span className="text-sm font-semibold text-zinc-900">
                  Add hero first
                </span>
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  Required first
                </span>
              </div>
              <span className="mt-2 text-xs leading-relaxed text-zinc-500">
                {quickInsertPending
                  ? "Adding section…"
                  : "Seeds the required homepage hero so the blank state disappears and the normal section-by-section builder flow takes over."}
              </span>
            </button>
          </div>

          <ol className="mt-4 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-zinc-500">
            <li>Add the hero and confirm the blank state disappears.</li>
            <li>Use the navigator Add section button to insert the next body section.</li>
            <li>
              Rebuild advanced sections one by one: FAQ, tabs, carousel,
              masonry, then CTA.
            </li>
          </ol>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {visibleTiles.map((tile) => {
            const busy = pending && pendingSlug === tile.slug;
            const Wire = tile.Wire;
            return (
              <div
                key={tile.slug}
                className="group flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:border-indigo-300 hover:shadow-md"
              >
                <div className="overflow-hidden rounded-md bg-zinc-50 p-2">
                  <Wire className="h-20 w-full text-zinc-400" />
                </div>
                <div className="flex items-start justify-between gap-2 px-1 pt-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-zinc-900">
                      {tile.label}
                    </h3>
                    <InfoTip label={tile.info} />
                  </div>
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-zinc-500">
                    {tile.sections} sections
                  </span>
                </div>
                <p className="line-clamp-3 px-1 text-xs leading-relaxed text-zinc-500">
                  {tile.summary}
                </p>
                <button
                  type="button"
                  disabled={pending}
                  data-empty-canvas-template-open={tile.slug}
                  onClick={() => openTemplateGallery(tile.slug)}
                  className="mt-auto inline-flex items-center justify-center rounded-md bg-[#3d4f7c] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#4a5e94] disabled:cursor-not-allowed disabled:opacity-50"
                  title={`Open the template gallery with the ${tile.label} starter highlighted.`}
                >
                  {busy ? "Applying…" : "Start with this"}
                </button>
              </div>
            );
          })}
        </div>
        {!availabilityLoaded ? (
          <p className="mt-3 text-[11px] text-zinc-500">Loading starters…</p>
        ) : null}
        {availabilityError ? (
          <p className="mt-3 text-[11px] text-zinc-500">
            Couldn&apos;t load full template access. Showing available starters
            only.
          </p>
        ) : null}
        {freePlan ? (
          <p className="mt-3 text-[11px] text-zinc-500">
            Free includes one single-page starter with featured roster profiles
            (up to five on Free). Upgrade to Studio to unlock additional starter
            templates.
          </p>
        ) : null}

        <p className="mt-6 text-[11px] leading-relaxed text-zinc-500">
          Every starter creates a draft composition with real-looking default
          copy. You can change anything — including the starter&apos;s brand
          preset — after it&apos;s applied.
        </p>

        {showTemplateGallery ? (
          <div className="mt-6 border-t border-zinc-100 pt-4">
            <WorkspaceTemplateGallery
              defaultOpen={false}
              enableSave={false}
              reloadOnApply
            />
          </div>
        ) : null}
      </div>
      <StarterTemplateGalleryModal
        open={templateGalleryOpen}
        tiles={templateGalleryTiles}
        allTiles={galleryCatalogTiles}
        activeCategory={templateGalleryCategory}
        query={templateGalleryQuery}
        highlightedSlug={highlightedTemplateSlug}
        pending={pending}
        pendingSlug={pendingSlug}
        onCategoryChange={setTemplateGalleryCategory}
        onQueryChange={setTemplateGalleryQuery}
        onClose={() => setTemplateGalleryOpen(false)}
        onApplyStart={setPendingSlug}
        dispatch={dispatch}
      />
    </div>
  );
}

export function StarterTemplateGalleryModal({
  open,
  tiles,
  allTiles,
  activeCategory,
  query,
  highlightedSlug,
  pending,
  pendingSlug,
  onCategoryChange,
  onQueryChange,
  onClose,
  onApplyStart,
  dispatch,
  confirmOnApply = false,
  currentDraftSections = [],
  savedTemplatesSlot = null,
  errorMessage = null,
  infoMessage = null,
}: {
  open: boolean;
  tiles: RecipeTile[];
  allTiles: RecipeTile[];
  activeCategory: (typeof STARTER_TEMPLATE_CATEGORIES)[number]["key"];
  query: string;
  highlightedSlug: string | null;
  pending: boolean;
  pendingSlug: string | null;
  onCategoryChange: (
    category: (typeof STARTER_TEMPLATE_CATEGORIES)[number]["key"],
  ) => void;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onApplyStart: (slug: string) => void;
  dispatch: (payload: FormData) => void;
  confirmOnApply?: boolean;
  currentDraftSections?: TemplateCurrentSectionSummary[];
  savedTemplatesSlot?: ReactNode;
  errorMessage?: string | null;
  infoMessage?: string | null;
}) {
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);
  const [homeCoreOnly, setHomeCoreOnly] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const countFor = (
    category: (typeof STARTER_TEMPLATE_CATEGORIES)[number]["key"],
  ) =>
    category === "all"
      ? allTiles.length
      : allTiles.filter((tile) => tile.category === category).length;

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    if (open) return;
    setConfirmSlug(null);
    setPreviewSlug(null);
    setHomeCoreOnly(false);
  }, [open]);

  const visibleTiles = homeCoreOnly
    ? tiles.filter((tile) => summarizeTemplateSourceKinds(tile).homeCore >= 3)
    : tiles;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (confirmSlug) {
        setConfirmSlug(null);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [confirmSlug, onClose, open]);

  if (!open) return null;

  const previewTile =
    visibleTiles.find((tile) => tile.slug === previewSlug) ??
    visibleTiles.find((tile) => tile.slug === highlightedSlug) ??
    visibleTiles[0] ??
    null;
  const confirmTile =
    visibleTiles.find((tile) => tile.slug === confirmSlug) ??
    allTiles.find((tile) => tile.slug === confirmSlug) ??
    null;
  const requiresReview = confirmOnApply && currentDraftSections.length > 0;
  const requestApply = (tile: RecipeTile) => {
    if (!requiresReview) {
      onApplyStart(tile.slug);
      return true;
    }
    setPreviewSlug(tile.slug);
    setConfirmSlug(tile.slug);
    return false;
  };

  return (
    <div
      data-empty-canvas-template-gallery
      className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/45 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Template gallery"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Template gallery
            </div>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">
              Start from a flexible composition
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">
              Wireframe starters for the future template marketplace. Today
              they use the existing section seeding action; later each card can
              become a full saved-template preview with reusable blocks.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
            aria-label="Close template gallery"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="border-b border-zinc-200 px-5 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={searchInputRef}
                data-empty-canvas-template-search
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search templates, industries, sections..."
                className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-500/10"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {STARTER_TEMPLATE_CATEGORIES.map((category) => {
                const active = activeCategory === category.key;
                return (
                  <button
                    key={category.key}
                    type="button"
                    onClick={() => onCategoryChange(category.key)}
                    className={
                      active
                        ? "shrink-0 rounded-full bg-[#3d4f7c] px-3 py-1.5 text-xs font-semibold text-white"
                        : "shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:border-indigo-200 hover:text-zinc-950"
                    }
                  >
                    {category.label}
                    <span className={active ? "ml-1 text-white/70" : "ml-1 text-zinc-400"}>
                      {countFor(category.key)}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                data-template-home-core-toggle
                aria-pressed={homeCoreOnly}
                onClick={() => setHomeCoreOnly((value) => !value)}
                className={
                  homeCoreOnly
                    ? "shrink-0 rounded-full bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white"
                    : "shrink-0 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:border-sky-300"
                }
              >
                Home core
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {errorMessage ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {errorMessage}
            </div>
          ) : null}
          {infoMessage ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {infoMessage}
            </div>
          ) : null}
          {visibleTiles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500">
              {homeCoreOnly
                ? "No home-core templates match this search yet."
                : "No templates match this search yet."}
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="grid content-start gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2">
                {visibleTiles.map((tile) => {
                  const Wire = tile.Wire;
                  const highlighted = highlightedSlug === tile.slug;
                  const selected = previewTile?.slug === tile.slug;
                  const busy = pending && pendingSlug === tile.slug;
                  const sources = summarizeTemplateSourceKinds(tile);
                  return (
                    <form
                      key={tile.slug}
                      action={dispatch}
                      data-template-card={tile.slug}
                      onSubmit={(event) => {
                        if (!requestApply(tile)) {
                          event.preventDefault();
                          return;
                        }
                      }}
                      className={
                        highlighted
                          ? "flex flex-col gap-3 rounded-xl border border-indigo-300 bg-white p-3 text-left shadow-[0_0_0_3px_rgba(99,102,241,0.14)]"
                          : selected
                            ? "flex flex-col gap-3 rounded-xl border border-zinc-400 bg-white p-3 text-left shadow-sm"
                            : "flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:border-indigo-200 hover:shadow-md"
                      }
                    >
                      <input type="hidden" name="recipeSlug" value={tile.slug} />
                      <button
                        type="button"
                        data-template-preview-open={tile.slug}
                        onClick={() => setPreviewSlug(tile.slug)}
                        className="overflow-hidden rounded-lg bg-zinc-50 p-2 text-left transition hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        aria-label={`Preview ${tile.label} starter`}
                      >
                        <Wire className="h-24 w-full text-zinc-400" />
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-indigo-700">
                          {tile.bestFor}
                        </span>
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                          {tile.category}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-base font-semibold leading-tight tracking-tight text-zinc-950">
                              {tile.label}
                            </h4>
                            <InfoTip label={tile.info} />
                          </div>
                          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-500">
                            {tile.summary}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-500">
                          {tile.sections} sections
                        </span>
                      </div>
                      <div
                        data-template-section-sequence={tile.slug}
                        className="flex flex-wrap gap-1"
                        aria-label={`${tile.label} section sequence`}
                      >
                        {tile.sequence.slice(0, 6).map((item) => (
                          <span
                            key={item}
                            className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-500"
                          >
                            {item}
                          </span>
                        ))}
                        {tile.sequence.length > 6 ? (
                          <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                            +{tile.sequence.length - 6}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {sources.homeCore > 0 ? (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                            Home core {sources.homeCore}
                          </span>
                        ) : null}
                        {sources.liveData > 0 ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            Live data {sources.liveData}
                          </span>
                        ) : null}
                        {sources.navigation > 0 ? (
                          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                            Navigation {sources.navigation}
                          </span>
                        ) : null}
                        {sources.starterContent > 0 ? (
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                            Starter {sources.starterContent}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-auto grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setPreviewSlug(tile.slug)}
                          className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-indigo-200 hover:text-zinc-950"
                        >
                          Preview details
                        </button>
                        <button
                          type="submit"
                          disabled={pending}
                          className="inline-flex h-10 items-center justify-center rounded-lg bg-[#3d4f7c] px-3 text-sm font-semibold text-white transition hover:bg-[#4a5e94] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busy
                            ? "Applying..."
                            : requiresReview
                              ? "Review starter"
                              : "Apply starter"}
                        </button>
                      </div>
                    </form>
                  );
                })}
              </div>

              {previewTile ? (
                <TemplatePreviewPanel
                  tile={previewTile}
                  pending={pending}
                  busy={pending && pendingSlug === previewTile.slug}
                  requiresReview={requiresReview}
                  dispatch={dispatch}
                  currentDraftSections={currentDraftSections}
                  onApplyStart={onApplyStart}
                  onReviewApply={(tileSlug) => {
                    setPreviewSlug(tileSlug);
                    setConfirmSlug(tileSlug);
                  }}
                />
              ) : null}
              {confirmTile ? (
                <TemplateApplyReviewDialog
                  tile={confirmTile}
                  currentDraftSections={currentDraftSections}
                  pending={pending}
                  busy={pending && pendingSlug === confirmTile.slug}
                  dispatch={dispatch}
                  onApplyStart={onApplyStart}
                  onClose={() => setConfirmSlug(null)}
                />
              ) : null}
            </div>
          )}
          {savedTemplatesSlot ? (
            <div className="mt-5 border-t border-zinc-200 pt-4">
              {savedTemplatesSlot}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TemplatePreviewPanel({
  tile,
  pending,
  busy,
  requiresReview,
  dispatch,
  currentDraftSections,
  onApplyStart,
  onReviewApply,
}: {
  tile: RecipeTile;
  pending: boolean;
  busy: boolean;
  requiresReview: boolean;
  dispatch: (payload: FormData) => void;
  currentDraftSections: TemplateCurrentSectionSummary[];
  onApplyStart: (slug: string) => void;
  onReviewApply: (slug: string) => void;
}) {
  const Wire = tile.Wire;
  const sources = summarizeTemplateSourceKinds(tile);

  return (
    <aside
      data-template-preview-panel={tile.slug}
      className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 xl:sticky xl:top-0"
      aria-label={`${tile.label} template preview`}
    >
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white p-3">
        <Wire className="h-36 w-full text-zinc-400" />
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Preview
          </p>
          <h4 className="mt-1 text-lg font-semibold leading-tight tracking-tight text-zinc-950">
            {tile.label}
          </h4>
        </div>
        <span className="shrink-0 rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-500">
          {tile.sections} sections
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600">{tile.info}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="font-semibold text-zinc-900">Best for</div>
          <div className="mt-1 text-zinc-500">{tile.bestFor}</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="font-semibold text-zinc-900">Category</div>
          <div className="mt-1 capitalize text-zinc-500">{tile.category}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {sources.homeCore > 0 ? (
          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
            Home core sections: {sources.homeCore}
          </span>
        ) : null}
        {sources.liveData > 0 ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            Live data sections: {sources.liveData}
          </span>
        ) : null}
        {sources.navigation > 0 ? (
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
            Navigation sections: {sources.navigation}
          </span>
        ) : null}
        {sources.starterContent > 0 ? (
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
            Starter sections: {sources.starterContent}
          </span>
        ) : null}
      </div>
      <div className="mt-4">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
          Section order
        </div>
        <ol
          data-template-preview-sequence={tile.slug}
          className="mt-2 space-y-1.5"
        >
          {tile.sequence.map((item, index) => (
            <li
              key={`${tile.slug}-${item}-${index}`}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-700"
            >
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold tabular-nums text-zinc-500">
                {index + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </div>
      {requiresReview ? (
        <div
          data-template-current-draft-summary
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3"
        >
          <div className="text-xs font-semibold text-amber-950">
            Applying this replaces the current draft composition.
          </div>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            {currentDraftSections.length} current section
            {currentDraftSections.length === 1 ? "" : "s"} stay in the section
            library, but this homepage draft will switch to the starter order.
          </p>
        </div>
      ) : null}
      <form
        action={dispatch}
        onSubmit={(event) => {
          if (requiresReview) {
            event.preventDefault();
            onReviewApply(tile.slug);
            return;
          }
          onApplyStart(tile.slug);
        }}
        className="mt-4"
      >
        <input type="hidden" name="recipeSlug" value={tile.slug} />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#3d4f7c] px-3 text-sm font-semibold text-white transition hover:bg-[#4a5e94] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Applying..." : requiresReview ? "Review and apply" : "Apply this starter"}
        </button>
      </form>
    </aside>
  );
}

function TemplateApplyReviewDialog({
  tile,
  currentDraftSections,
  pending,
  busy,
  dispatch,
  onApplyStart,
  onClose,
}: {
  tile: RecipeTile;
  currentDraftSections: TemplateCurrentSectionSummary[];
  pending: boolean;
  busy: boolean;
  dispatch: (payload: FormData) => void;
  onApplyStart: (slug: string) => void;
  onClose: () => void;
}) {
  const homeCoreIndexSet = useMemo(
    () => new Set(resolveEssentialHomeIndexes(tile.sectionTypeKeys)),
    [tile.sectionTypeKeys],
  );
  const hasStrongHomeCore = homeCoreIndexSet.size >= 3;
  const [selectedIndexes, setSelectedIndexes] = useState<ReadonlySet<number>>(
    () => new Set(tile.sequence.map((_, index) => index)),
  );
  const [styleByIndex, setStyleByIndex] = useState<ReadonlyMap<number, string>>(
    () => new Map(),
  );
  const [lockHomeCore, setLockHomeCore] = useState<boolean>(hasStrongHomeCore);

  useEffect(() => {
    setSelectedIndexes(new Set(tile.sequence.map((_, index) => index)));
    setStyleByIndex(new Map());
    setLockHomeCore(hasStrongHomeCore);
  }, [hasStrongHomeCore, tile.slug, tile.sequence]);

  const normalizedSelectedIndexes = useMemo(() => {
    if (!lockHomeCore || !hasStrongHomeCore) return selectedIndexes;
    const next = new Set(selectedIndexes);
    for (const index of homeCoreIndexSet) next.add(index);
    return next;
  }, [hasStrongHomeCore, homeCoreIndexSet, lockHomeCore, selectedIndexes]);

  const selectedCount = normalizedSelectedIndexes.size;
  const canApply = selectedCount > 0;

  function toggleIndex(index: number) {
    if (lockHomeCore && homeCoreIndexSet.has(index)) return;
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedIndexes(new Set(tile.sequence.map((_, index) => index)));
  }

  function selectCore() {
    const next = new Set(tile.sequence.slice(0, 4).map((_, index) => index));
    if (lockHomeCore) {
      for (const index of homeCoreIndexSet) next.add(index);
    }
    setSelectedIndexes(next);
  }

  function selectHomeCoreSet() {
    const indexes = resolveEssentialHomeIndexes(tile.sectionTypeKeys);
    if (indexes.length >= 3) {
      setSelectedIndexes(new Set(indexes));
      return;
    }
    selectCore();
  }

  function setStyle(index: number, styleId: string) {
    setStyleByIndex((prev) => {
      const next = new Map(prev);
      if (!styleId) {
        next.delete(index);
      } else {
        next.set(index, styleId);
      }
      return next;
    });
  }

  return (
    <div
      data-template-apply-review={tile.slug}
      className="fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/45 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Review applying ${tile.label}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Review draft replacement
            </div>
            <h4 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">
              Apply {tile.label}
            </h4>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">
              The existing sections are not deleted. They remain available in
              the section library, while the homepage draft changes to this
              starter composition.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
            aria-label="Close replacement review"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-zinc-950">Current draft</div>
              <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium text-zinc-500">
                {currentDraftSections.length} sections
              </span>
            </div>
            <ol
              data-template-review-current-sections
              className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1"
            >
              {currentDraftSections.slice(0, 12).map((section, index) => (
                <li
                  key={section.id}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-800">
                    <span className="text-[10px] font-semibold tabular-nums text-zinc-400">
                      {index + 1}
                    </span>
                    <span className="min-w-0 truncate">{section.name}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {section.slotLabel} · {section.typeLabel}
                  </div>
                </li>
              ))}
              {currentDraftSections.length > 12 ? (
                <li className="rounded-lg border border-dashed border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500">
                  +{currentDraftSections.length - 12} more sections
                </li>
              ) : null}
            </ol>
          </div>

          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-zinc-950">Starter draft</div>
              <span className="rounded-full border border-indigo-100 bg-white px-2 py-0.5 text-xs font-medium text-indigo-700">
                {selectedCount} of {tile.sections} sections
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={selectAll}
                className="rounded-lg border border-indigo-100 bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-700"
              >
                Select all
              </button>
              {tile.sequence.length > 4 ? (
                <button
                  type="button"
                  onClick={selectCore}
                  className="rounded-lg border border-indigo-100 bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-700"
                >
                  Core 4
                </button>
              ) : null}
              <button
                type="button"
                onClick={selectHomeCoreSet}
                className="rounded-lg border border-indigo-100 bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-700"
              >
                Home core
              </button>
              {hasStrongHomeCore ? (
                <button
                  type="button"
                  data-template-lock-home-core-toggle
                  aria-pressed={lockHomeCore}
                  onClick={() => setLockHomeCore((value) => !value)}
                  className={
                    lockHomeCore
                      ? "rounded-lg border border-sky-200 bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-800"
                      : "rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-medium text-sky-700"
                  }
                >
                  {lockHomeCore ? "Home core locked" : "Home core unlocked"}
                </button>
              ) : null}
            </div>
            <ol
              data-template-review-next-sections={tile.slug}
              className="mt-3 space-y-1.5"
            >
              {tile.sequence.map((item, index) => {
                const sectionType = tile.sectionTypeKeys[index] ?? "hero";
                const homeCoreSection = homeCoreIndexSet.has(index);
                return (
                  <li
                    key={`${tile.slug}-review-${item}-${index}`}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      normalizedSelectedIndexes.has(index)
                        ? "border-indigo-200 bg-white text-zinc-800"
                        : "border-zinc-200 bg-zinc-50 text-zinc-500"
                    }`}
                  >
                    <div className="mb-1.5 pl-7">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${sectionSourceBadgeClass(sectionType)}`}
                        >
                          {sectionSourceLabel(sectionType)}
                        </span>
                        {homeCoreSection ? (
                          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                            Home core
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={normalizedSelectedIndexes.has(index)}
                      onChange={() => toggleIndex(index)}
                      disabled={lockHomeCore && homeCoreSection}
                      aria-label={`Include ${item}`}
                      className="h-4 w-4 shrink-0 border-zinc-300 text-indigo-600"
                    />
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-semibold tabular-nums text-indigo-700">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </div>
                    {normalizedSelectedIndexes.has(index) &&
                    STARTER_STYLE_OPTIONS_BY_TYPE[sectionType] ? (
                    <div className="mt-2 pl-7">
                      <label className="text-[11px] font-medium text-zinc-500">
                        Layout style
                        <select
                          value={styleByIndex.get(index) ?? ""}
                          onChange={(event) => setStyle(index, event.target.value)}
                          className="mt-1 block h-8 w-full rounded-lg border border-indigo-100 bg-white px-2 text-xs text-zinc-700"
                        >
                          <option value="">Default style</option>
                          {(STARTER_STYLE_OPTIONS_BY_TYPE[sectionType] ?? []).map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            {!canApply ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Select at least one section to apply this starter.
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Keep current draft
          </button>
          <form
            action={dispatch}
            onSubmit={(event) => {
              if (!canApply) {
                event.preventDefault();
                return;
              }
              onApplyStart(tile.slug);
            }}
          >
            <input type="hidden" name="recipeSlug" value={tile.slug} />
            <input
              type="hidden"
              name="lockHomeCore"
              value={lockHomeCore ? "1" : "0"}
            />
            {Array.from(normalizedSelectedIndexes).map((index) => (
              <input
                key={`${tile.slug}-selected-${index}`}
                type="hidden"
                name="starterEntryIndex"
                value={String(index)}
              />
            ))}
            {Array.from(styleByIndex.entries()).map(([index, styleId]) => (
              <input
                key={`${tile.slug}-style-${index}`}
                type="hidden"
                name="starterEntryStyle"
                value={`${index}:${styleId}`}
              />
            ))}
            <button
              type="submit"
              disabled={pending || !canApply}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-[#3d4f7c] px-4 text-sm font-semibold text-white transition hover:bg-[#4a5e94] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Applying..." : `Apply ${selectedCount} section${selectedCount === 1 ? "" : "s"}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
