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

import { useEffect, useMemo, useState } from "react";

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

type TabKey = "basics" | "seo" | "social" | "url" | "code";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "basics", label: "Basics" },
  { key: "seo", label: "SEO" },
  { key: "social", label: "Social" },
  { key: "url", label: "URL & robots" },
  { key: "code", label: "Code" },
];

const TITLE_MAX = 60;
const DESC_MAX = 160;

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

function CodeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function metadataEqual(a: PageMetadata, b: PageMetadata): boolean {
  return (
    a.title === b.title &&
    (a.metaDescription ?? "") === (b.metaDescription ?? "") &&
    (a.introTagline ?? "") === (b.introTagline ?? "")
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

// ── PageSettingsDrawer ───────────────────────────────────────────────────────

export function PageSettingsDrawer() {
  const {
    pageSettingsOpen,
    closePageSettings,
    pageMetadata,
    savePageMetadata,
    saving,
  } = useEditContext();

  const [tab, setTab] = useState<TabKey>("basics");
  const [draft, setDraft] = useState<PageMetadata | null>(pageMetadata);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [host, setHost] = useState<string>("");

  // Resync the working copy whenever the drawer opens or the upstream
  // metadata changes from outside (e.g. another tab published).
  useEffect(() => {
    if (pageSettingsOpen) {
      setDraft(pageMetadata);
      setErrorMsg(null);
      setTab("basics");
    }
  }, [pageSettingsOpen, pageMetadata]);

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

        {tab === "basics" || tab === "seo" ? (
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
                  style={inputLgStyle()}
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
                  style={textareaStyle()}
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

        {tab === "seo" ? (
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

        {tab === "social" ? (
          <Card>
            <CardHead
              icon={<ShareIcon />}
              title="Social card preview"
              sub="OpenGraph + Twitter"
            />
            <CardBody>
              <SocialPreview
                host={host}
                title={draft?.title ?? "Untitled page"}
              />
              <button
                type="button"
                disabled
                title="Coming soon — social image upload"
                style={{
                  marginTop: 10,
                  height: 28,
                  padding: "0 10px",
                  fontSize: 11,
                  fontWeight: 500,
                  color: CHROME.muted2,
                  background: CHROME.paper2,
                  border: `1px dashed ${CHROME.lineMid}`,
                  borderRadius: 7,
                  cursor: "not-allowed",
                }}
              >
                Replace social image · coming soon
              </button>
            </CardBody>
          </Card>
        ) : null}

        {tab === "url" ? (
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
              <CardHead icon={<GlobeIcon />} title="Search engines" />
              <CardBody padding="tight">
                <div style={{ padding: "8px 4px" }}>
                  <Toggle
                    on
                    onChange={() => {
                      /* Phase 8 — wire to robots.indexable */
                    }}
                    label="Allow search engines to index this page"
                    helper="Disabled = robots noindex."
                    disabled
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

        {tab === "code" ? (
          <Card>
            <CardHead
              icon={<CodeIcon />}
              title="Custom code"
              sub="Coming soon"
            />
            <CardBody>
              <div
                style={{
                  fontSize: 12,
                  color: CHROME.muted,
                  lineHeight: 1.5,
                }}
              >
                Per-page <code>&lt;head&gt;</code> snippets and custom CSS for
                power users land in a later phase. Until then, theme-wide code
                lives in the Theme drawer.
              </div>
            </CardBody>
          </Card>
        ) : null}
      </DrawerBody>

      <DrawerFoot
        start={
          <span style={{ fontSize: 11, color: CHROME.muted }}>
            Settings will be applied on next publish.
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

function SocialPreview({ host, title }: { host: string; title: string }) {
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
          background: "linear-gradient(135deg, #2a2a2a, #0a0a0a)",
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
        {title || "Untitled page"}
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
      </div>
    </div>
  );
}
