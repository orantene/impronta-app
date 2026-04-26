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
 *   - Social  — OG card preview placeholder + replace button (not wired yet)
 *   - URL & robots — slug + index/sitemap toggles (UI only; persisted slug
 *                    + robots flags arrive with the migration in Phase 8)
 *   - Code    — `<head>` injection placeholder (Phase 8)
 *
 * The fields beyond Basics are visible but disabled / labelled "Coming
 * soon" so the operator sees the surface and the contract while the data
 * model catches up. This is intentional — the mockup is the design
 * promise; this drawer ships the chrome and the bindings we own today,
 * and lights up the rest as the schema lands.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  Card,
  CardBody,
  CardHead,
  CHROME,
  Drawer,
  DrawerBody,
  DrawerFoot,
  DrawerHead,
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
    compositionLoaded,
    compositionLoading,
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
      setErrorMsg(res.error ?? "Could not save page settings.");
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
  useEffect(() => {
    if (!pageSettingsOpen) return;
    if (!draft || !pageMetadata) return;
    if (!dirty) return;
    if (submitting || saving) return;
    if (titleOver || descOver || ogTitleOver || ogDescOver) return;
    const timer = window.setTimeout(() => {
      setSubmitting(true);
      setErrorMsg(null);
      void savePageMetadata(draft).then((res) => {
        setSubmitting(false);
        if (!res.ok) {
          setErrorMsg(res.error ?? "Could not save page settings.");
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
    <Drawer kind="pageSettings" open={pageSettingsOpen} zIndex={87}>
      <DrawerHead
        eyebrow="Page settings"
        title="Homepage"
        titleStyle="display"
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
          >
            {errorMsg}
          </div>
        ) : null}

        {!draft ? (
          // Loading / not-yet-loaded state. Without this, the inputs render
          // with empty `?? ""` fallbacks and the drawer reads as broken.
          // Show a soft skeleton + status line so the operator knows we're
          // waiting on the composition fetch (or surface the failure if the
          // fetch is done but returned no metadata).
          <div
            className="rounded-[10px] px-4 py-6 text-[12px]"
            style={{
              background: CHROME.paper2,
              border: `1px solid ${CHROME.line}`,
              color: CHROME.muted,
            }}
            aria-busy={compositionLoading || !compositionLoaded || undefined}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block animate-pulse rounded-full"
                style={{ width: 8, height: 8, background: CHROME.muted2 }}
                aria-hidden
              />
              {compositionLoading || !compositionLoaded
                ? "Loading page settings…"
                : "Page settings unavailable for this page."}
            </div>
            <div
              className="mt-3 space-y-2"
              aria-hidden
              style={{ opacity: 0.6 }}
            >
              <div
                className="h-3 w-1/3 rounded"
                style={{ background: CHROME.line }}
              />
              <div
                className="h-9 w-full rounded"
                style={{ background: CHROME.line }}
              />
              <div
                className="h-3 w-1/4 rounded"
                style={{ background: CHROME.line }}
              />
              <div
                className="h-16 w-full rounded"
                style={{ background: CHROME.line }}
              />
            </div>
          </div>
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
                    OG image URL
                  </FieldLabel>
                  <input
                    id="ps-og-image"
                    type="url"
                    value={draft?.ogImageUrl ?? ""}
                    onChange={(e) =>
                      patch(
                        "ogImageUrl",
                        e.target.value === "" ? null : e.target.value,
                      )
                    }
                    style={inputStyle()}
                    placeholder="https://… or /path/to/image.jpg"
                  />
                  <Helper>
                    <span>
                      Paste a fully qualified URL or a /path; image must be
                      reachable to render in shares.
                    </span>
                  </Helper>
                </Field>
              </CardBody>
            </Card>
          </>
        ) : null}

        {draft && tab === "url" ? (
          <>
            <Card>
              <CardHead icon={<LinkIcon />} title="URL slug" />
              <CardBody>
                <div className="flex items-center gap-1.5">
                  <span
                    style={{
                      fontFamily:
                        '"JetBrains Mono", "SF Mono", ui-monospace, monospace',
                      fontSize: 12,
                      color: CHROME.muted,
                    }}
                  >
                    {host || "—"}/
                  </span>
                  <input
                    type="text"
                    value=""
                    placeholder="(homepage)"
                    disabled
                    title="Slug editing arrives with multi-page support"
                    style={{
                      ...inputStyle(),
                      flex: 1,
                      fontFamily:
                        '"JetBrains Mono", "SF Mono", ui-monospace, monospace',
                      fontSize: 12,
                      color: CHROME.muted2,
                      background: CHROME.paper2,
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: CHROME.muted,
                    lineHeight: 1.4,
                  }}
                >
                  Homepage always lives at <code>/</code>. Custom slugs unlock
                  with multi-page support.
                </div>
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
                    value={draft?.canonicalUrl ?? ""}
                    onChange={(e) =>
                      patch(
                        "canonicalUrl",
                        e.target.value === "" ? null : e.target.value,
                      )
                    }
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
                    on={!(draft?.noindex ?? false)}
                    onChange={(next) => patch("noindex", !next)}
                    label="Allow search engines to index this page"
                    helper="Disabled emits robots noindex; the page is hidden from Google."
                  />
                </div>
                <div style={{ padding: "8px 4px" }}>
                  <Toggle
                    on={false}
                    onChange={() => {
                      /* Phase 8 — wire to robots.sitemap */
                    }}
                    label="Show in sitemap"
                    helper="Adds /sitemap.xml entry."
                    disabled
                  />
                </div>
              </CardBody>
            </Card>
          </>
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
                background: !dirty || submitting ? CHROME.muted2 : CHROME.ink,
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
            : "linear-gradient(135deg, #2a2a2a, #0a0a0a)",
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
