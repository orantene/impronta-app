"use client";

/**
 * PageSettingsDrawer — first-class drawer for SEO + URL + social settings.
 *
 * Mirrors mockup surface 5 (`docs/mockups/builder-experience.html` § 5).
 * Same chrome shape as InspectorDock and PublishDrawer:
 *   eyebrow → display title + savechip → meta line (host · slug) → tools
 *   → pill-tab bar → paper body with white cards → footer with primary
 *   action.
 *
 * The drawer reads `pageMetadata` from EditContext, holds a local working
 * copy while the operator is editing, and writes through `savePageMetadata`
 * (which routes to the same dispatchMutation pipeline as structural moves
 * — optimistic apply, CAS save, rollback on conflict, undo capture).
 *
 * Tabs in scope this phase:
 *   - Basics  — page title, meta description, tagline (the only fields the
 *               PageMetadata schema currently exposes)
 *   - SEO     — live Google-style search preview synthesised from Basics
 *   - Social  — OG card preview + OpenGraph overrides
 *   - URL & robots — slug editing (non-home pages), structured-data (JSON-LD)
 *                    authoring, canonical override, index + sitemap toggles,
 *                    and a redirect manager. (P4-SEO / T4.3.)
 *
 * Basics/Social fields persist through the composition `metadata` save path
 * (CAS + undo). The URL & robots tab's slug / sitemap / JSON-LD / redirect
 * controls persist INDEPENDENTLY via `cms-seo-actions.ts` — those are page-row
 * (and `cms_redirects`) edits the in-canvas composition save doesn't carry, so
 * they save in place and don't disturb the composition's version CAS.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Button,
  Card,
  CardBody,
  CardHead,
  CHROME,
  Drawer,
  DrawerBody,
  DrawerFoot,
  DrawerHead,
  DrawerSkeleton,
  DrawerTab,
  DrawerTabs,
  Field,
  FieldLabel,
  Helper,
  HelperCounter,
  SaveChip,
  Toggle,
} from "./kit";
import { useEditContext, type PageMetadata } from "./edit-context";
import { MediaPickerButton } from "./inspectors/kit";
import { safeAction } from "@/lib/site-admin/edit-mode/safe-action";
import {
  createRedirectAction,
  deleteRedirectAction,
  listRedirectsAction,
  loadPageSeoAction,
  savePageSeoFlagsAction,
  savePageSlugAction,
  setRedirectActiveAction,
  type CmsRedirectRow,
} from "@/lib/site-admin/cms-seo-actions";
import {
  organizationJsonLdStub,
  parsePageJsonLd,
} from "@/lib/site-admin/cms-seo";

// Phase 0 sweep (2026-04-26) — convergence-plan §1:
// - "Code" tab said "Coming soon"; product debt removed until per-page custom
//   code is genuinely in scope.
// - "Templates" tab moved out: templates are a composition operation, not a
//   page setting. Single canonical surface remains the EmptyCanvasStarter
//   gallery; Phase A will lift it to a topbar button per builder mockup
//   §8 / §18.
type TabKey = "basics" | "seo" | "social" | "url";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "basics", label: "Basics" },
  { key: "seo", label: "SEO" },
  { key: "social", label: "Social" },
  { key: "url", label: "URL & robots" },
];

const TITLE_MAX = 60;
const DESC_MAX = 160;
// Shared limits between Basics and Social tabs. OG title/description follow
// the same SEO-norm targets — shorter is fine, but the chip warns the
// operator before they pass the truncation cliff in major share surfaces.
const OG_TITLE_MAX = 60;
const OG_DESC_MAX = 160;

function CogIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
      <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function metadataEqual(a: PageMetadata, b: PageMetadata): boolean {
  return (
    a.title === b.title &&
    (a.metaTitle ?? "") === (b.metaTitle ?? "") &&
    (a.metaDescription ?? "") === (b.metaDescription ?? "") &&
    (a.introTagline ?? "") === (b.introTagline ?? "") &&
    (a.ogTitle ?? "") === (b.ogTitle ?? "") &&
    (a.ogDescription ?? "") === (b.ogDescription ?? "") &&
    (a.ogImageUrl ?? "") === (b.ogImageUrl ?? "") &&
    (a.canonicalUrl ?? "") === (b.canonicalUrl ?? "") &&
    a.noindex === b.noindex
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    background: CHROME.surface,
    border: `1px solid ${CHROME.lineMid}`,
    borderRadius: 7,
    padding: "8px 10px",
    fontSize: 13,
    lineHeight: 1.4,
    color: CHROME.ink,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
    outline: "none",
  };
}

function inputLgStyle(): React.CSSProperties {
  return {
    ...inputStyle(),
    fontSize: 14,
    padding: "10px 12px",
    fontWeight: 500,
  };
}

function textareaStyle(): React.CSSProperties {
  return {
    ...inputStyle(),
    minHeight: 72,
    resize: "vertical",
  };
}

/**
 * Visual override applied to inputs whose char count is over the
 * documented max. Pairs with `aria-invalid` so SRs flag the field.
 * The HelperCounter already turns amber at the same threshold; this
 * is the second signal so the field itself reads as "needs attention".
 */
function overLimitStyle(active: boolean): React.CSSProperties | undefined {
  if (!active) return undefined;
  return {
    borderColor: CHROME.rose,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.5), 0 0 0 1px ${CHROME.roseLine}`,
  };
}

// ── PageSettingsDrawer ───────────────────────────────────────────────────────

export function PageSettingsDrawer() {
  const {
    pageSettingsOpen,
    closePageSettings,
    pageMetadata,
    savePageMetadata,
    saving,
    pageId,
    pageSlug,
    tenantSiteLabel,
    tenantId,
  } = useEditContext();

  const [tab, setTab] = useState<TabKey>("basics");
  const [draft, setDraft] = useState<PageMetadata | null>(pageMetadata);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [host, setHost] = useState<string>("");

  // Reset the working copy + tab on every closed→open transition.
  //
  // We deliberately do NOT resync on `pageMetadata` changes while the drawer
  // is open — once batch-7 wired idle-autosave, every successful save bumps
  // `pageMetadata` from this drawer itself. Resyncing on that signal would
  // (a) snap the user back to the Basics tab mid-typing, and (b) flicker the
  // working copy through a loop. The upstream-publish-from-another-tab case
  // becomes a CAS conflict on next save, which is the right place to recover
  // (we already auto-refresh + show a 3.5s notice on VERSION_CONFLICT).
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = pageSettingsOpen;
    if (pageSettingsOpen && !wasOpen) {
      setDraft(pageMetadata);
      setErrorMsg(null);
      setTab("basics");
    }
  }, [pageSettingsOpen, pageMetadata]);

  // Race condition: the operator can hit "Page settings" before the
  // composition fetch resolves (router.refresh + slow DB, or first-paint
  // open via a deep link). When the drawer opens, `pageMetadata` is still
  // null, so the prev-open effect above seeds `draft` with null and the
  // body renders empty inputs that look broken — exactly the "empty body"
  // symptom flagged in the builder-experience audit. As soon as the
  // composition lands and `pageMetadata` becomes non-null, hydrate the
  // draft once. We gate on `draft === null` so we never clobber an
  // in-flight edit; the prev-open effect already handles the
  // closed→open re-seed for the normal warm-cache case.
  useEffect(() => {
    if (!pageSettingsOpen) return;
    if (draft !== null) return;
    if (!pageMetadata) return;
    setDraft(pageMetadata);
  }, [pageSettingsOpen, draft, pageMetadata]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHost(window.location.host);
    }
  }, []);

  const dirty = useMemo(() => {
    if (!draft || !pageMetadata) return false;
    return !metadataEqual(draft, pageMetadata);
  }, [draft, pageMetadata]);

  const titleLen = (draft?.title ?? "").length;
  const descLen = (draft?.metaDescription ?? "").length;
  const ogTitleLen = (draft?.ogTitle ?? "").length;
  const ogDescLen = (draft?.ogDescription ?? "").length;
  const titleOver = titleLen > TITLE_MAX;
  const descOver = descLen > DESC_MAX;
  const ogTitleOver = ogTitleLen > OG_TITLE_MAX;
  const ogDescOver = ogDescLen > OG_DESC_MAX;

  function patch<K extends keyof PageMetadata>(key: K, value: PageMetadata[K]) {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: value };
    });
  }

  async function handleSave() {
    if (!draft || !dirty) return;
    setSubmitting(true);
    setErrorMsg(null);
    const res = await savePageMetadata(draft);
    setSubmitting(false);
    if (!res.ok) {
      setErrorMsg(res.error ?? "Couldn't save page settings — try again.");
      return;
    }
    closePageSettings();
  }

  function handleCancel() {
    setDraft(pageMetadata);
    setErrorMsg(null);
    closePageSettings();
  }

  /**
   * Debounced autosave — match the inspector dock behaviour. Once the user
   * stops typing for ~800ms, commit the current draft without closing the
   * drawer. No-op while a save is already in flight or while any length
   * field is over-limit (those would fail server validation anyway). The
   * explicit Save & close button still works for users who'd rather hit
   * commit and dismiss in one motion.
   */
  // QA 2026-05-13 — debounced autosave race. `submitting` was read
  // from closure state inside the timer; setting it true happens
  // asynchronously inside `.then()`, so a timer that fires between
  // the dispatch and the next render saw `submitting === false` and
  // could kick off a concurrent save with the same draft. `savingRef`
  // is set synchronously before dispatch and checked synchronously
  // inside the timer body — concurrent dispatches can no longer slip.
  const savingRef = useRef(false);
  useEffect(() => {
    if (!pageSettingsOpen) return;
    if (!draft || !pageMetadata) return;
    if (!dirty) return;
    if (submitting || saving) return;
    if (titleOver || descOver || ogTitleOver || ogDescOver) return;
    const timer = window.setTimeout(() => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSubmitting(true);
      setErrorMsg(null);
      void savePageMetadata(draft).then((res) => {
        savingRef.current = false;
        setSubmitting(false);
        if (!res.ok) {
          setErrorMsg(res.error ?? "Couldn't save page settings — try again.");
        }
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [
    pageSettingsOpen,
    draft,
    pageMetadata,
    dirty,
    submitting,
    saving,
    titleOver,
    descOver,
    ogTitleOver,
    ogDescOver,
    savePageMetadata,
  ]);

  const chipStatus = submitting || saving ? "saving" : dirty ? "dirty" : "saved";

  return (
    <Drawer
      kind="pageSettings"
      open={pageSettingsOpen}
      zIndex={87}
      ariaLabelledBy="page-settings-drawer-title"
      modal
      onRequestClose={submitting ? undefined : closePageSettings}
      floating
      floatLabel="Page settings"
      floatPanelId="page-settings"
    >
      <DrawerHead
        titleId="page-settings-drawer-title"
        title="Page settings"
        icon={<CogIcon />}
        saveChip={<SaveChip status={chipStatus} />}
        meta={<>{host || "—"} <span style={{ color: CHROME.muted2 }}>·</span> /</>}
        onClose={submitting ? undefined : closePageSettings}
      />

      <DrawerTabs>
        {TABS.map((t) => (
          <DrawerTab
            key={t.key}
            active={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </DrawerTab>
        ))}
      </DrawerTabs>

      <DrawerBody>
        {errorMsg ? (
          <div
            className="mb-3 rounded-md px-3 py-2 text-[11px]"
            style={{
              background: CHROME.roseBg,
              border: `1px solid ${CHROME.roseLine}`,
              color: CHROME.rose,
            }}
            role="alert"
            aria-live="assertive"
          >
            {errorMsg}
          </div>
        ) : null}

        {!draft ? (
          // Loading / not-yet-loaded state. Without this, the inputs render
          // with empty `?? ""` fallbacks and the drawer reads as broken.
          // Show the shared DrawerSkeleton so all drawers have a consistent
          // loading treatment (Wave 1 Item 1C job #12).
          <DrawerSkeleton rows={4} />
        ) : null}

        {draft && (tab === "basics" || tab === "seo") ? (
          <Card>
            <CardHead icon={<FileIcon />} title="Basics" />
            <CardBody>
              <Field>
                <FieldLabel
                  htmlFor="ps-title"
                  required
                  meta="Browser tab + Google"
                >
                  Page title
                </FieldLabel>
                <input
                  id="ps-title"
                  type="text"
                  value={draft?.title ?? ""}
                  onChange={(e) => patch("title", e.target.value)}
                  aria-invalid={titleOver || undefined}
                  style={{ ...inputLgStyle(), ...overLimitStyle(titleOver) }}
                  placeholder="Impronta · A house of curated talent"
                />
                <Helper>
                  <span>
                    Used in browser tabs, bookmarks, and search results.
                  </span>
                  <HelperCounter current={titleLen} max={TITLE_MAX} />
                </Helper>
              </Field>

              <Field>
                <FieldLabel htmlFor="ps-meta-title" meta="SERP / tab override">
                  Meta title
                </FieldLabel>
                <input
                  id="ps-meta-title"
                  type="text"
                  value={draft?.metaTitle ?? ""}
                  onChange={(e) =>
                    patch(
                      "metaTitle",
                      e.target.value === "" ? null : e.target.value,
                    )
                  }
                  style={inputStyle()}
                  placeholder="Optional — defaults to page title when empty"
                />
                <Helper>
                  <span>Shown in browser tabs and search when set.</span>
                </Helper>
              </Field>

              <Field>
                <FieldLabel htmlFor="ps-desc" meta="SEO snippet">
                  Meta description
                </FieldLabel>
                <textarea
                  id="ps-desc"
                  value={draft?.metaDescription ?? ""}
                  onChange={(e) =>
                    patch(
                      "metaDescription",
                      e.target.value === "" ? null : e.target.value,
                    )
                  }
                  aria-invalid={descOver || undefined}
                  style={{ ...textareaStyle(), ...overLimitStyle(descOver) }}
                  placeholder="A boutique agency curating bilingual talent for events, brand campaigns, and editorial work."
                />
                <Helper>
                  <span>Shown beneath title in Google.</span>
                  <HelperCounter current={descLen} max={DESC_MAX} />
                </Helper>
              </Field>

              <Field flush>
                <FieldLabel htmlFor="ps-tagline" meta="Above H1 on page">
                  Tagline
                </FieldLabel>
                <input
                  id="ps-tagline"
                  type="text"
                  value={draft?.introTagline ?? ""}
                  onChange={(e) =>
                    patch(
                      "introTagline",
                      e.target.value === "" ? null : e.target.value,
                    )
                  }
                  style={inputStyle()}
                  placeholder="Quiet, unhurried, always in the same key."
                />
              </Field>
            </CardBody>
          </Card>
        ) : null}

        {draft && tab === "seo" ? (
          <Card>
            <CardHead icon={<GlobeIcon />} title="Search preview" />
            <CardBody>
              <SearchPreview
                host={host}
                title={draft?.title ?? ""}
                description={draft?.metaDescription ?? ""}
              />
            </CardBody>
          </Card>
        ) : null}

        {draft && tab === "social" ? (
          <>
            <Card>
              <CardHead
                icon={<ShareIcon />}
                title="Social card preview"
                sub="OpenGraph + Twitter"
              />
              <CardBody>
                <SocialPreview
                  host={host}
                  title={
                    draft?.ogTitle ??
                    draft?.title ??
                    "Untitled page"
                  }
                  imageUrl={draft?.ogImageUrl ?? null}
                  description={
                    draft?.ogDescription ?? draft?.metaDescription ?? null
                  }
                />
              </CardBody>
            </Card>

            <Card>
              <CardHead
                icon={<ShareIcon />}
                title="OpenGraph overrides"
                sub="Falls back to title / description when blank"
              />
              <CardBody>
                <Field>
                  <FieldLabel htmlFor="ps-og-title" meta="Optional">
                    OG title
                  </FieldLabel>
                  <input
                    id="ps-og-title"
                    type="text"
                    value={draft?.ogTitle ?? ""}
                    onChange={(e) =>
                      patch(
                        "ogTitle",
                        e.target.value === "" ? null : e.target.value,
                      )
                    }
                    aria-invalid={ogTitleOver || undefined}
                    style={{ ...inputStyle(), ...overLimitStyle(ogTitleOver) }}
                    placeholder="Defaults to page title"
                  />
                  <Helper>
                    <span>Shown when this URL is shared on social.</span>
                    <HelperCounter current={ogTitleLen} max={OG_TITLE_MAX} />
                  </Helper>
                </Field>

                <Field>
                  <FieldLabel htmlFor="ps-og-desc" meta="Optional">
                    OG description
                  </FieldLabel>
                  <textarea
                    id="ps-og-desc"
                    value={draft?.ogDescription ?? ""}
                    onChange={(e) =>
                      patch(
                        "ogDescription",
                        e.target.value === "" ? null : e.target.value,
                      )
                    }
                    aria-invalid={ogDescOver || undefined}
                    style={{ ...textareaStyle(), ...overLimitStyle(ogDescOver) }}
                    placeholder="Defaults to meta description"
                  />
                  <Helper>
                    <span>Sub-line on the share card.</span>
                    <HelperCounter current={ogDescLen} max={OG_DESC_MAX} />
                  </Helper>
                </Field>

                <Field flush>
                  <FieldLabel htmlFor="ps-og-image" meta="1200×630 recommended">
                    OG image
                  </FieldLabel>
                  <MediaPickerButton
                    tenantId={tenantId}
                    value={draft?.ogImageUrl ?? null}
                    onChange={(next) => patch("ogImageUrl", next)}
                    emptyLabel="Add share image"
                    aspect="21/9"
                  />
                  <Helper>
                    <span>
                      Used on social share cards. Falls back to page title and
                      description when blank.
                    </span>
                  </Helper>
                </Field>
              </CardBody>
            </Card>
          </>
        ) : null}

        {draft && tab === "url" ? (
          <UrlRobotsTab
            host={host}
            pageId={pageId}
            pageSlug={pageSlug}
            tenantSiteLabel={tenantSiteLabel}
            open={pageSettingsOpen}
            canonicalUrl={draft?.canonicalUrl ?? ""}
            onCanonicalChange={(value) =>
              patch("canonicalUrl", value === "" ? null : value)
            }
            noindex={draft?.noindex ?? false}
            onNoindexChange={(value) => patch("noindex", value)}
          />
        ) : null}

      </DrawerBody>

      <DrawerFoot
        start={
          <span style={{ fontSize: 11, color: CHROME.muted }}>
            Settings save as a draft. Publish to push them live.
          </span>
        }
        end={
          <>
            <button
              type="button"
              onClick={handleCancel}
              disabled={submitting}
              style={{
                height: 30,
                padding: "0 12px",
                fontSize: 12,
                fontWeight: 500,
                color: CHROME.text2,
                background: CHROME.surface,
                border: `1px solid ${CHROME.lineMid}`,
                borderRadius: 7,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || submitting}
              style={{
                height: 30,
                padding: "0 14px",
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                background: !dirty || submitting ? CHROME.muted2 : CHROME.accent,
                border: "none",
                borderRadius: 7,
                cursor:
                  !dirty || submitting ? "not-allowed" : "pointer",
                boxShadow:
                  !dirty || submitting
                    ? "none"
                    : "0 1px 2px rgba(0,0,0,0.10)",
              }}
            >
              {submitting ? "Saving…" : "Save settings"}
            </button>
          </>
        }
      />
    </Drawer>
  );
}

// ── SearchPreview (Google SERP-style triplet) ────────────────────────────────

function SearchPreview({
  host,
  title,
  description,
}: {
  host: string;
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        padding: 12,
        background: CHROME.paper,
        border: `1px solid ${CHROME.line}`,
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: CHROME.muted,
          lineHeight: 1.4,
        }}
      >
        {host || "—"}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 16,
          fontWeight: 500,
          color: "#1a0dab",
          lineHeight: 1.3,
          letterSpacing: "-0.005em",
        }}
      >
        {title || "Untitled page"}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 12,
          color: CHROME.text2,
          lineHeight: 1.45,
        }}
      >
        {description || (
          <span style={{ color: CHROME.muted2, fontStyle: "italic" }}>
            Add a meta description to control the snippet.
          </span>
        )}
      </div>
    </div>
  );
}

// ── SocialPreview (OG card placeholder) ──────────────────────────────────────

function SocialPreview({
  host,
  title,
  imageUrl,
  description,
}: {
  host: string;
  title: string;
  imageUrl?: string | null;
  description?: string | null;
}) {
  return (
    <div
      style={{
        border: `1px solid ${CHROME.line}`,
        borderRadius: 10,
        overflow: "hidden",
        background: CHROME.paper2,
      }}
    >
      <div
        style={{
          aspectRatio: "1.91 / 1",
          background: imageUrl
            ? `url(${JSON.stringify(imageUrl)}) center/cover no-repeat`
            : "linear-gradient(135deg, #242942, #1a1f35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#f5f0e8",
          fontFamily:
            '"New York", "Times New Roman", "PT Serif", Georgia, serif',
          fontSize: 22,
          letterSpacing: "-0.01em",
          padding: "0 24px",
          textAlign: "center",
          fontStyle: "italic",
        }}
      >
        {imageUrl ? null : title || "Untitled page"}
      </div>
      <div
        style={{
          padding: "10px 12px",
          background: CHROME.surface,
          borderTop: `1px solid ${CHROME.line}`,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: CHROME.muted2,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {host || "—"}
        </div>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: CHROME.ink,
            marginTop: 2,
          }}
        >
          {title || "Untitled page"}
        </div>
        {description ? (
          <div
            style={{
              fontSize: 12,
              color: CHROME.muted,
              marginTop: 4,
              lineHeight: 1.4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {description}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── small button helpers (match the footer button language) ──────────────────

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      style={{
        marginTop: 6,
        fontSize: 11,
        color: CHROME.rose,
        lineHeight: 1.4,
      }}
    >
      {message}
    </div>
  );
}

function StatusNote({ tone, text }: { tone: "ok" | "muted"; text: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        color: tone === "ok" ? CHROME.green : CHROME.muted,
      }}
    >
      {text}
    </span>
  );
}

// ── UrlRobotsTab — slug · structured data · canonical · indexing · redirects ──

interface UrlRobotsTabProps {
  host: string;
  pageId: string | null;
  pageSlug: string | null;
  tenantSiteLabel: string | null;
  open: boolean;
  canonicalUrl: string;
  onCanonicalChange: (value: string) => void;
  noindex: boolean;
  onNoindexChange: (value: boolean) => void;
}

function UrlRobotsTab(props: UrlRobotsTabProps) {
  const {
    host,
    pageId,
    pageSlug,
    tenantSiteLabel,
    open,
    canonicalUrl,
    onCanonicalChange,
    noindex,
    onNoindexChange,
  } = props;

  const isHomepage = !pageSlug;

  // SEO state loaded from the page row on open (slug / sitemap / json-ld).
  const [seoLoaded, setSeoLoaded] = useState(false);
  const [isSystemOwned, setIsSystemOwned] = useState(false);
  const [slugDraft, setSlugDraft] = useState("");
  const [savedSlug, setSavedSlug] = useState("");
  const [slugBusy, setSlugBusy] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugSavedTick, setSlugSavedTick] = useState(false);

  const [sitemapOn, setSitemapOn] = useState(true);
  const [sitemapBusy, setSitemapBusy] = useState(false);

  const [jsonLdDraft, setJsonLdDraft] = useState("");
  const [savedJsonLd, setSavedJsonLd] = useState("");
  const [jsonLdBusy, setJsonLdBusy] = useState(false);
  const [jsonLdError, setJsonLdError] = useState<string | null>(null);
  const [jsonLdSavedTick, setJsonLdSavedTick] = useState(false);

  // Load page SEO once per open.
  const loadedForOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      loadedForOpenRef.current = false;
      return;
    }
    if (loadedForOpenRef.current) return;
    if (!pageId) return;
    loadedForOpenRef.current = true;
    setSeoLoaded(false);
    let cancelled = false;
    void safeAction(() => loadPageSeoAction({ pageId }), {
      name: "loadPageSeoAction",
      fallback: { ok: false as const, error: "Couldn't load SEO settings." },
    }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setIsSystemOwned(res.seo.isSystemOwned);
        setSlugDraft(res.seo.slug);
        setSavedSlug(res.seo.slug);
        setSitemapOn(res.seo.includeInSitemap);
        setJsonLdDraft(res.seo.jsonLdText);
        setSavedJsonLd(res.seo.jsonLdText);
      }
      setSeoLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, pageId]);

  const slugDirty = slugDraft.trim() !== savedSlug;
  const jsonLdDirty = jsonLdDraft !== savedJsonLd;
  // Live client-side validation so the operator sees errors before saving.
  const jsonLdLiveError = useMemo(() => {
    const parsed = parsePageJsonLd(jsonLdDraft);
    return parsed.ok ? null : parsed.error;
  }, [jsonLdDraft]);

  const saveSlug = useCallback(async () => {
    if (!pageId || !slugDirty || slugBusy) return;
    setSlugBusy(true);
    setSlugError(null);
    setSlugSavedTick(false);
    const res = await safeAction(
      () => savePageSlugAction({ pageId, slug: slugDraft.trim() }),
      {
        name: "savePageSlugAction",
        fallback: { ok: false as const, error: "Network error — try again." },
      },
    );
    setSlugBusy(false);
    if (!res.ok) {
      setSlugError(res.error);
      return;
    }
    setSavedSlug(res.slug);
    setSlugDraft(res.slug);
    setSlugSavedTick(true);
  }, [pageId, slugDraft, slugDirty, slugBusy]);

  const saveSitemap = useCallback(
    async (next: boolean) => {
      if (!pageId || sitemapBusy) return;
      setSitemapOn(next); // optimistic
      setSitemapBusy(true);
      const res = await safeAction(
        () => savePageSeoFlagsAction({ pageId, includeInSitemap: next }),
        {
          name: "savePageSeoFlagsAction.sitemap",
          fallback: { ok: false as const, error: "Network error — try again." },
        },
      );
      setSitemapBusy(false);
      if (!res.ok) setSitemapOn(!next); // rollback
    },
    [pageId, sitemapBusy],
  );

  const saveJsonLd = useCallback(async () => {
    if (!pageId || !jsonLdDirty || jsonLdBusy) return;
    if (jsonLdLiveError) {
      setJsonLdError(jsonLdLiveError);
      return;
    }
    setJsonLdBusy(true);
    setJsonLdError(null);
    setJsonLdSavedTick(false);
    const res = await safeAction(
      () => savePageSeoFlagsAction({ pageId, jsonLdRaw: jsonLdDraft }),
      {
        name: "savePageSeoFlagsAction.jsonLd",
        fallback: { ok: false as const, error: "Network error — try again." },
      },
    );
    setJsonLdBusy(false);
    if (!res.ok) {
      setJsonLdError(res.error);
      return;
    }
    setSavedJsonLd(jsonLdDraft);
    setJsonLdSavedTick(true);
  }, [pageId, jsonLdDraft, jsonLdDirty, jsonLdBusy, jsonLdLiveError]);

  const slugLocked = isHomepage || isSystemOwned;
  const monoFont =
    '"JetBrains Mono", "SF Mono", ui-monospace, monospace';

  return (
    <>
      <Card>
        <CardHead icon={<LinkIcon />} title="URL slug" />
        <CardBody>
          <div className="flex items-center gap-1.5">
            <span style={{ fontFamily: monoFont, fontSize: 12, color: CHROME.muted }}>
              {host || "—"}/
            </span>
            <input
              type="text"
              value={slugLocked ? "" : slugDraft}
              onChange={(e) => {
                setSlugDraft(e.target.value.toLowerCase().replace(/\s+/g, "-"));
                setSlugError(null);
                setSlugSavedTick(false);
              }}
              placeholder={slugLocked ? "(homepage)" : "about/team"}
              disabled={slugLocked || !seoLoaded}
              spellCheck={false}
              style={{
                ...inputStyle(),
                flex: 1,
                fontFamily: monoFont,
                fontSize: 12,
                color: slugLocked ? CHROME.muted2 : CHROME.ink,
                background: slugLocked ? CHROME.paper2 : CHROME.surface,
              }}
            />
            {!slugLocked ? (
              <Button
                variant="primary"
                size="sm"
                onClick={saveSlug}
                disabled={!slugDirty || slugBusy || !seoLoaded}
              >
                {slugBusy ? "Saving…" : "Save"}
              </Button>
            ) : null}
          </div>
          <div style={{ marginTop: 8 }}>
            {slugLocked ? (
              <span style={{ fontSize: 11, color: CHROME.muted, lineHeight: 1.4 }}>
                The homepage always lives at <code>/</code>. Other pages can set
                a custom slug.
              </span>
            ) : slugSavedTick && !slugDirty ? (
              <StatusNote tone="ok" text={`Saved · ${host}/${savedSlug}`} />
            ) : (
              <span style={{ fontSize: 11, color: CHROME.muted, lineHeight: 1.4 }}>
                Lowercase letters, digits, hyphens, and / only. Changing the
                slug changes this page&rsquo;s public URL.
              </span>
            )}
            <FieldError message={slugError} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHead
          icon={<GlobeIcon />}
          title="Structured data"
          sub="schema.org JSON-LD"
        />
        <CardBody>
          <Field flush>
            <FieldLabel htmlFor="ps-jsonld" meta="Optional · advanced">
              JSON-LD
            </FieldLabel>
            <textarea
              id="ps-jsonld"
              value={jsonLdDraft}
              onChange={(e) => {
                setJsonLdDraft(e.target.value);
                setJsonLdError(null);
              }}
              disabled={!seoLoaded}
              spellCheck={false}
              aria-invalid={Boolean(jsonLdLiveError) || undefined}
              placeholder={
                '{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "…"\n}'
              }
              style={{
                ...textareaStyle(),
                fontFamily: monoFont,
                fontSize: 12,
                minHeight: 132,
                ...overLimitStyle(Boolean(jsonLdLiveError)),
              }}
            />
            <Helper>
              <span>
                Emitted as a{" "}
                <code style={{ fontFamily: monoFont, fontSize: 11 }}>
                  &lt;script type=&quot;application/ld+json&quot;&gt;
                </code>{" "}
                for rich results. One object or an array of objects.
              </span>
            </Helper>
            {jsonLdLiveError || jsonLdError ? (
              <FieldError message={jsonLdLiveError ?? jsonLdError} />
            ) : jsonLdSavedTick && !jsonLdDirty ? (
              <div style={{ marginTop: 6 }}>
                <StatusNote tone="ok" text="Structured data saved." />
              </div>
            ) : null}
            <div
              style={{
                marginTop: 10,
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <Button
                variant="primary"
                size="sm"
                onClick={saveJsonLd}
                disabled={!jsonLdDirty || jsonLdBusy || !seoLoaded || Boolean(jsonLdLiveError)}
              >
                {jsonLdBusy ? "Saving…" : "Save structured data"}
              </Button>
              {jsonLdDraft.trim().length === 0 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setJsonLdDraft(
                      organizationJsonLdStub({
                        name: tenantSiteLabel ?? "",
                        url: host ? `https://${host}` : null,
                      }),
                    )
                  }
                  disabled={!seoLoaded}
                >
                  Insert Organization stub
                </Button>
              ) : null}
            </div>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHead icon={<LinkIcon />} title="Canonical URL" />
        <CardBody>
          <Field flush>
            <FieldLabel htmlFor="ps-canonical" meta="Optional override">
              Canonical link
            </FieldLabel>
            <input
              id="ps-canonical"
              type="url"
              value={canonicalUrl}
              onChange={(e) => onCanonicalChange(e.target.value)}
              style={inputStyle()}
              placeholder="Leave blank to use the page's own URL"
            />
            <Helper>
              <span>
                Use only when consolidating duplicate URLs to a single
                destination. Must be absolute (https://…) or root-relative
                (/path).
              </span>
            </Helper>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHead icon={<GlobeIcon />} title="Search engines" />
        <CardBody padding="tight">
          <div style={{ padding: "8px 4px" }}>
            <Toggle
              on={!noindex}
              onChange={(next) => onNoindexChange(!next)}
              label="Allow search engines to index this page"
              helper="Disabled emits robots noindex; the page is hidden from Google."
            />
          </div>
          <div style={{ padding: "8px 4px" }}>
            <Toggle
              on={sitemapOn}
              onChange={(next) => void saveSitemap(next)}
              label="Show in sitemap"
              helper="Adds this page to /sitemap.xml. Saved immediately."
              disabled={!seoLoaded || sitemapBusy}
            />
          </div>
        </CardBody>
      </Card>

      <RedirectsCard open={open} host={host} />
    </>
  );
}

// ── RedirectsCard — list / add / enable / delete cms_redirects ───────────────

function RedirectsCard({ open, host }: { open: boolean; host: string }) {
  const [loaded, setLoaded] = useState(false);
  const [rows, setRows] = useState<ReadonlyArray<CmsRedirectRow>>([]);
  const [fromPath, setFromPath] = useState("");
  const [toPath, setToPath] = useState("");
  const [permanent, setPermanent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadedForOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      loadedForOpenRef.current = false;
      return;
    }
    if (loadedForOpenRef.current) return;
    loadedForOpenRef.current = true;
    setLoaded(false);
    let cancelled = false;
    void safeAction(() => listRedirectsAction(), {
      name: "listRedirectsAction",
      fallback: { ok: false as const, error: "Couldn't load redirects." },
    }).then((res) => {
      if (cancelled) return;
      if (res.ok) setRows(res.redirects);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const addRedirect = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await safeAction(
      () =>
        createRedirectAction({
          oldPath: fromPath,
          newPath: toPath,
          statusCode: permanent ? 301 : 302,
        }),
      {
        name: "createRedirectAction",
        fallback: { ok: false as const, error: "Network error — try again." },
      },
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setRows((prev) => [res.redirect, ...prev]);
    setFromPath("");
    setToPath("");
  }, [busy, fromPath, toPath, permanent]);

  const toggleActive = useCallback(async (row: CmsRedirectRow) => {
    const next = !row.active;
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, active: next } : r)),
    );
    const res = await safeAction(
      () => setRedirectActiveAction({ id: row.id, active: next }),
      {
        name: "setRedirectActiveAction",
        fallback: { ok: false as const, error: "Network error — try again." },
      },
    );
    if (!res.ok) {
      // rollback + surface
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, active: row.active } : r)),
      );
      setError(res.error);
    }
  }, []);

  const removeRedirect = useCallback(async (id: string) => {
    const snapshot = id;
    setRows((prev) => prev.filter((r) => r.id !== snapshot));
    const res = await safeAction(() => deleteRedirectAction({ id }), {
      name: "deleteRedirectAction",
      fallback: { ok: false as const, error: "Network error — try again." },
    });
    if (!res.ok) setError(res.error);
  }, []);

  const monoFont = '"JetBrains Mono", "SF Mono", ui-monospace, monospace';

  return (
    <Card>
      <CardHead
        icon={<LinkIcon />}
        title="Redirects"
        sub="301 / 302 path forwarding"
      />
      <CardBody>
        <div className="flex flex-col gap-1.5">
          <input
            type="text"
            value={fromPath}
            onChange={(e) => setFromPath(e.target.value)}
            placeholder="/old-page"
            spellCheck={false}
            style={{ ...inputStyle(), fontFamily: monoFont, fontSize: 12 }}
          />
          <input
            type="text"
            value={toPath}
            onChange={(e) => setToPath(e.target.value)}
            placeholder="/new-page"
            spellCheck={false}
            style={{ ...inputStyle(), fontFamily: monoFont, fontSize: 12 }}
          />
          <div className="flex items-center justify-between" style={{ marginTop: 2 }}>
            <Toggle
              on={permanent}
              onChange={setPermanent}
              label={permanent ? "Permanent (301)" : "Temporary (302)"}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={addRedirect}
              disabled={busy || fromPath.trim() === "" || toPath.trim() === ""}
            >
              {busy ? "Adding…" : "Add redirect"}
            </Button>
          </div>
          <FieldError message={error} />
        </div>

        <div style={{ marginTop: 12 }}>
          {!loaded ? (
            <div style={{ fontSize: 11, color: CHROME.muted }}>
              Loading redirects…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ fontSize: 11, color: CHROME.muted, lineHeight: 1.4 }}>
              No redirects yet. Add one above to forward an old URL on{" "}
              {host || "this site"} to a new path.
            </div>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rows.map((row) => (
                <li
                  key={row.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 9px",
                    background: CHROME.surface,
                    border: `1px solid ${CHROME.line}`,
                    borderRadius: 7,
                    opacity: row.active ? 1 : 0.55,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: monoFont,
                        fontSize: 11.5,
                        color: CHROME.ink,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {row.oldPath} → {row.newPath}
                    </div>
                    <div style={{ fontSize: 10, color: CHROME.muted2, marginTop: 1 }}>
                      {row.statusCode} · {row.active ? "active" : "disabled"}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void toggleActive(row)}
                    title={row.active ? "Disable" : "Enable"}
                  >
                    {row.active ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void removeRedirect(row.id)}
                    title="Delete"
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
