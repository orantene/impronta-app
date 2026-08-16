"use client";

/**
 * TalentMaxSiteManager — the `/talent/site` management home for a Talent Max
 * SITE (the multi-page website served at `/t/site/<slug>`, SEPARATE from the
 * `/t/<code>` discovery profile).
 *
 * Surfaces:
 *   - the live site URL `/t/site/<slug>` ("another link" the talent can share),
 *   - the site address (slug) editor (validated unique + slugified),
 *   - the logo upload (→ talent_sites.logo_url),
 *   - the PAGES list — add / rename / delete / reorder / set-home + edit links
 *     into the multi-page builder, plus an "Edit site shell" link,
 *   - a PUBLISH action (publishes every page + bakes the shell + marks live), and
 *   - a clearly-labelled mount point for a future Custom-domain panel (a sibling
 *     agent builds it — see TALENT_SITE_DOMAIN_PANEL_SLOT below).
 *
 * Max-only: a non-Max talent sees an upsell card (not a 404). All writes are
 * owner+Max-gated server actions; RLS independently backs them.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { COLORS, FONTS, useAdminShell } from "@/components/admin/shell/internal/state";
import { PrimaryButton } from "@/components/admin/shell/internal/primitives";
import {
  loadMaxSiteManagerAction,
  addMaxSitePageAction,
  renameMaxSitePageAction,
  deleteMaxSitePageAction,
  reorderMaxSitePagesAction,
  setMaxSiteHomePageAction,
  setMaxSiteSlugAction,
  publishMaxSiteAction,
  applyMaxSiteTemplateAction,
} from "@/lib/talent-site/server/site-management-actions";
import type {
  MaxSiteManagerState,
  MaxSiteManagerPage,
} from "@/lib/talent-site/server/site-management-types";
import { listMaxSiteTemplateSummaries } from "@/lib/talent-site/max-site-templates/registry";
import { toUnifiedTemplateDef } from "@/lib/site-admin/builder-core/templates/template-def";
import { TemplatePickerPanel } from "@/components/edit-chrome/template-picker-panel";
import { TalentMaxSiteTemplateThumb } from "@/components/talent/site/TalentMaxSiteTemplateThumb";
import { TalentSiteDomainPanel } from "@/components/talent/site/TalentSiteDomainPanel";
import { uploadTalentMaxSiteLogo } from "@/lib/client/signed-upload";
import { removeMaxSiteLogoAction } from "@/lib/talent-site/server/site-logo-actions";
import {
  PageAddForm,
  PageDeleteConfirm,
  PageRenameForm,
  slugifyPageTitle,
} from "@/components/talent/site/TalentMaxSiteManagerPageForms";

type Props = { locale?: "en" | "es" };

export function TalentMaxSiteManager(_props: Props) {
  const [state, setState] = useState<MaxSiteManagerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await loadMaxSiteManagerAction();
    if (!res.ok) {
      setError(res.error);
      setState(null);
    } else {
      setError(null);
      setState(res.data ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return <Card><span style={mutedText}>Loading your website…</span></Card>;
  }
  if (error || !state) {
    return <Card><span style={{ ...mutedText, color: COLORS.criticalDeep }}>{error ?? "Could not load your website."}</span></Card>;
  }

  if (!state.canManage) {
    return <UpsellCard />;
  }

  return <ManagerBody state={state} onReload={reload} />;
}

// ── Upsell (non-Max) ─────────────────────────────────────────────────────────

function UpsellCard() {
  const { openDrawer } = useAdminShell();
  return (
    <Card>
      <Badge>MAX FEATURE</Badge>
      <h3 style={{ margin: "10px 0 6px", fontFamily: FONTS.display, fontSize: 16, fontWeight: 700, color: COLORS.ink }}>
        Your own website
      </h3>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.55, maxWidth: 560 }}>
        Upgrade to Max to build a full multi-page website with your own header, logo,
        footer, and a custom address — published at its own link, separate from your
        discovery profile.
      </p>
      <PrimaryButton onClick={() => openDrawer("talent-tier-compare")}>See plans</PrimaryButton>
    </Card>
  );
}

// ── Manager body (Max) ───────────────────────────────────────────────────────

function ManagerBody({ state, onReload }: { state: MaxSiteManagerState; onReload: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [publishedJustNow, setPublishedJustNow] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      setActionError(null);
      const res = await fn();
      if (!res.ok) {
        setActionError(res.error ?? "Something went wrong.");
        return;
      }
      await onReload();
    });
  }

  function handlePublish() {
    startTransition(async () => {
      setActionError(null);
      const res = await publishMaxSiteAction();
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      setPublishedJustNow(true);
      await onReload();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-talent-max-site-manager>
      {/* Live URL + publish */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={sectionLabel}>Your website</div>
            <p style={{ margin: "4px 0 10px", fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5, maxWidth: 520 }}>
              A full multi-page site with your own header, logo and footer — published at its own
              link, separate from your discovery profile.
            </p>
            {state.publicSiteUrl ? (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  background: COLORS.surfaceAlt,
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 999,
                  fontFamily: FONTS.body,
                  fontSize: 12,
                }}
              >
                <span style={{ color: COLORS.inkMuted, fontWeight: 700 }}>Your site link</span>
                <Link
                  href={state.publicSiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: COLORS.ink, fontWeight: 600, textDecoration: "none" }}
                >
                  {state.publicSiteUrl} ↗
                </Link>
              </div>
            ) : (
              <span style={mutedText}>Set a site address below to claim your link.</span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <PrimaryButton onClick={handlePublish} disabled={pending}>
              {pending ? "Publishing…" : state.sitePublishedAt ? "Republish site" : "Publish site"}
            </PrimaryButton>
            <span style={{ fontSize: 11, color: COLORS.inkMuted }}>
              {publishedJustNow
                ? "Published — your site is live."
                : state.sitePublishedAt
                  ? `Live · last published ${formatWhen(state.sitePublishedAt)}`
                  : "Not published yet"}
            </span>
          </div>
        </div>
        {actionError ? (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: COLORS.criticalDeep }}>{actionError}</p>
        ) : null}
      </Card>

      {/* Starter template gallery */}
      <TemplateGallery talentProfileId={state.talentProfileId} onReload={onReload} />

      {/* Site address (slug) */}
      <SlugEditor state={state} onSaved={onReload} />

      {/* Logo */}
      <LogoPanel state={state} onSaved={onReload} />

      {/* Pages */}
      <PagesPanel state={state} pending={pending} run={run} />

      {/* Shell */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={sectionLabel}>Header &amp; footer (site shell)</div>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5, maxWidth: 520 }}>
              The shell renders around every page. Edit your logo, navigation and footer here.
            </p>
          </div>
          <Link href="/talent/page-builder?shell=1" style={linkButton}>Edit shell →</Link>
        </div>
      </Card>

      {/* Custom-domain panel — connect/verify a custom domain for this site.
          Self-hydrates via its own server action; Max-gated (this manager only
          renders for Max talents, so canManage is true here). */}
      <TalentSiteDomainPanel canManage />
    </div>
  );
}

// ── Slug editor ──────────────────────────────────────────────────────────────

function SlugEditor({ state, onSaved }: { state: MaxSiteManagerState; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState(state.siteSlug ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);

  useEffect(() => setValue(state.siteSlug ?? ""), [state.siteSlug]);

  function save() {
    start(async () => {
      setErr(null);
      setSavedSlug(null);
      const res = await setMaxSiteSlugAction({ slug: value });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setSavedSlug(res.data?.slug ?? value);
      await onSaved();
    });
  }

  const dirty = value.trim() !== (state.siteSlug ?? "");

  return (
    <Card>
      <div style={sectionLabel}>Site address</div>
      <p style={{ margin: "4px 0 10px", fontSize: 12.5, color: COLORS.inkMuted }}>
        Your link is <code style={code}>/t/site/{state.siteSlug ?? "…"}</code>. Letters, numbers and hyphens.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: COLORS.inkMuted, fontFamily: FONTS.body }}>/t/site/</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
          style={inputStyle}
          placeholder="your-name"
        />
        <PrimaryButton onClick={save} disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save address"}
        </PrimaryButton>
      </div>
      {err ? <p style={{ margin: "8px 0 0", fontSize: 12, color: COLORS.criticalDeep }}>{err}</p> : null}
      {savedSlug ? <p style={{ margin: "8px 0 0", fontSize: 12, color: COLORS.successDeep }}>Saved · /t/site/{savedSlug}</p> : null}
    </Card>
  );
}

// ── Logo ─────────────────────────────────────────────────────────────────────

function LogoPanel({ state, onSaved }: { state: MaxSiteManagerState; onSaved: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    start(async () => {
      setErr(null);
      // D7: the await used to be bare inside startTransition. A rejected
      // promise (the 413 the old Server-Action transport threw for any
      // real logo) escaped into React's transition error path and the
      // panel showed nothing at all — no error, no spinner change. Every
      // failure now lands in `err`.
      try {
        const res = await uploadTalentMaxSiteLogo({ file });
        if (!res.ok) {
          setErr(res.error);
          return;
        }
        if (inputRef.current) inputRef.current.value = "";
        await onSaved();
      } catch (cause) {
        setErr(
          cause instanceof Error && cause.message
            ? cause.message
            : "Upload failed. Try again.",
        );
      }
    });
  }

  function remove() {
    start(async () => {
      setErr(null);
      const res = await removeMaxSiteLogoAction();
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      await onSaved();
    });
  }

  return (
    <Card>
      <div style={sectionLabel}>Logo</div>
      <p style={{ margin: "4px 0 10px", fontSize: 12.5, color: COLORS.inkMuted }}>
        Shown in your site header. PNG, SVG, JPEG or WebP, under 10 MB.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {state.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={state.logoUrl}
            alt="Site logo"
            style={{ height: 48, maxWidth: 180, objectFit: "contain", background: COLORS.surfaceAlt, borderRadius: 8, padding: 6, border: `1px solid ${COLORS.borderSoft}` }}
          />
        ) : (
          <div style={{ height: 48, width: 120, display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.surfaceAlt, borderRadius: 8, border: `1px dashed ${COLORS.borderSoft}`, fontSize: 11, color: COLORS.inkMuted }}>
            No logo
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" onChange={onFile} style={{ display: "none" }} />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={pending} style={linkButton}>
          {pending ? "Uploading…" : state.logoUrl ? "Replace logo" : "Upload logo"}
        </button>
        {state.logoUrl ? (
          <button type="button" onClick={remove} disabled={pending} style={{ ...linkButton, color: COLORS.criticalDeep, borderColor: "rgba(176,48,58,0.3)" }}>
            Remove
          </button>
        ) : null}
      </div>
      {err ? <p style={{ margin: "8px 0 0", fontSize: 12, color: COLORS.criticalDeep }}>{err}</p> : null}
    </Card>
  );
}

// ── Pages ────────────────────────────────────────────────────────────────────
// Inline form components (PageRenameForm, PageDeleteConfirm, PageAddForm) and
// slugifyPageTitle are extracted to TalentMaxSiteManagerPageForms.tsx to keep
// this file under the 800-line ESLint cap. They are re-imported above.

function PagesPanel({
  state,
  pending,
  run,
}: {
  state: MaxSiteManagerState;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const pages = [...state.pages].sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug));
  // ONB-4 — inline form state: null = no form open.
  const [addingPage, setAddingPage] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function commitAdd(title: string) {
    setAddingPage(false);
    run(() => addMaxSitePageAction({ title }));
  }

  function commitRename(p: MaxSiteManagerPage, title: string, navLabel: string) {
    setRenamingId(null);
    if (!title) return;
    run(() => renameMaxSitePageAction({ pageId: p.id, title, navLabel }));
  }

  function commitDelete(p: MaxSiteManagerPage) {
    setDeletingId(null);
    run(() => deleteMaxSitePageAction({ pageId: p.id }));
  }

  function setHome(p: MaxSiteManagerPage) {
    run(() => setMaxSiteHomePageAction({ pageId: p.id }));
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...pages];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    run(() => reorderMaxSitePagesAction({ orderedIds: next.map((p) => p.id) }));
  }

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div>
          <div style={sectionLabel}>Pages</div>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: COLORS.inkMuted }}>
            Add pages, set your home page, and arrange the order they appear in your navigation.
          </p>
        </div>
        {!addingPage ? (
          <button type="button" onClick={() => setAddingPage(true)} disabled={pending} style={linkButton}>＋ Add page</button>
        ) : null}
      </div>

      {/* ONB-4 — inline add form with live slug preview */}
      {addingPage ? (
        <PageAddForm
          siteSlug={state.siteSlug}
          onSave={commitAdd}
          onCancel={() => setAddingPage(false)}
        />
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {pages.length === 0 && !addingPage ? (
          <span style={mutedText}>No pages yet. Add your first page.</span>
        ) : (
          pages.map((p, i) => {
            // ONB-4 — inline rename form replaces the button row for this page.
            if (renamingId === p.id) {
              return (
                <PageRenameForm
                  key={p.id}
                  page={p}
                  siteSlug={state.siteSlug}
                  onSave={(title, navLabel) => commitRename(p, title, navLabel)}
                  onCancel={() => setRenamingId(null)}
                />
              );
            }
            // ONB-4 — inline delete confirm replaces the page row.
            if (deletingId === p.id) {
              return (
                <PageDeleteConfirm
                  key={p.id}
                  page={p}
                  onConfirm={() => commitDelete(p)}
                  onCancel={() => setDeletingId(null)}
                />
              );
            }

            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "9px 12px",
                  background: COLORS.surfaceAlt,
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={pending || i === 0} style={arrowBtn}>▲</button>
                    <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={pending || i === pages.length - 1} style={arrowBtn}>▼</button>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                        {p.navLabel || p.title}
                      </span>
                      {p.isHome ? <Pill tone="green">Home</Pill> : null}
                      {p.status === "published" ? <Pill tone="green">Live</Pill> : <Pill tone="indigo">Draft</Pill>}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>/t/site/{state.siteSlug ?? "…"}{p.isHome ? "" : `/${p.slug}`}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {!p.isHome ? (
                    <button type="button" onClick={() => setHome(p)} disabled={pending} style={miniBtn}>Set home</button>
                  ) : null}
                  <Link href={`/talent/page-builder?page=${encodeURIComponent(p.slug)}`} style={miniBtnLink}>Edit</Link>
                  {/* ONB-4 — inline rename / delete instead of window.prompt / window.confirm */}
                  <button type="button" onClick={() => setRenamingId(p.id)} disabled={pending} style={miniBtn}>Rename</button>
                  {!p.isHome ? (
                    <button type="button" onClick={() => setDeletingId(p.id)} disabled={pending} style={{ ...miniBtn, color: COLORS.criticalDeep }}>Delete</button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

// ── Starter template gallery ─────────────────────────────────────────────────

/**
 * "Choose a starter template" gallery. Each card previews a named freeform
 * starter (label + emphasis + description). Applying REPLACES the current DRAFT
 * shell + draft home page with the chosen template — pre-filled with the talent's
 * own data — and is confirmed first. It does NOT publish (a clear note says to
 * publish to go live).
 */
function TemplateGallery({
  talentProfileId,
  onReload,
}: {
  talentProfileId: string;
  onReload: () => Promise<void>;
}) {
  // Convert the Max-site registry summaries into the SHARED UnifiedTemplateDef
  // shape (ONB-3) so the shared TemplatePickerPanel renders identical card
  // anatomy here as on the discovery-profile picker.
  const templates = useMemo(
    () =>
      listMaxSiteTemplateSummaries().map((t) =>
        toUnifiedTemplateDef(
          { key: t.key, label: t.label, description: t.description, emphasis: t.emphasis, thumbnailUrl: t.thumbnailUrl },
          "max-site",
        ),
      ),
    [],
  );

  async function apply(key: string): Promise<{ ok: boolean; error?: string | null }> {
    const res = await applyMaxSiteTemplateAction({ templateKey: key });
    if (!res.ok) return { ok: false, error: res.error };
    await onReload();
    return { ok: true };
  }

  return (
    <Card>
      <TemplatePickerPanel
        mode="site"
        heading="Choose a starter template"
        description={
          <>
            Pick a layout to start from. We&rsquo;ll fill it with your name, photo, bio and
            services. This replaces your current <strong>draft</strong> home page and shell —
            publish when you&rsquo;re ready to go live.
          </>
        }
        templates={templates}
        talentProfileId={talentProfileId}
        onApply={apply}
        renderFallbackThumb={(key) => <TalentMaxSiteTemplateThumb templateKey={key} />}
      />
    </Card>
  );
}

// ── Primitives ───────────────────────────────────────────────────────────────

function Card({ children, ...rest }: { children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 14,
        padding: "16px 18px",
        fontFamily: FONTS.body,
        ...(rest.style ?? {}),
      }}
    >
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 999, background: COLORS.successSoft, color: COLORS.successDeep, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4 }}>
      {children}
    </span>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "green" | "indigo" }) {
  const palette =
    tone === "green"
      ? { fg: COLORS.successDeep, bg: COLORS.successSoft }
      : { fg: COLORS.indigoDeep, bg: COLORS.indigoSoft };
  return (
    <span style={{ padding: "1px 7px", fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: palette.fg, background: palette.bg, borderRadius: 999 }}>
      {children}
    </span>
  );
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const sectionLabel: React.CSSProperties = {
  fontFamily: FONTS.display,
  fontSize: 15,
  fontWeight: 700,
  color: COLORS.ink,
};

const mutedText: React.CSSProperties = {
  fontFamily: FONTS.body,
  fontSize: 12.5,
  color: COLORS.inkMuted,
};

const inputStyle: React.CSSProperties = {
  flex: "1 1 160px",
  minWidth: 140,
  padding: "7px 10px",
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  fontSize: 13,
  fontFamily: FONTS.body,
  color: COLORS.ink,
};

const code: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11.5,
  background: COLORS.surfaceAlt,
  padding: "1px 5px",
  borderRadius: 5,
};

const linkButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "7px 13px",
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  background: "#fff",
  color: COLORS.ink,
  fontSize: 12.5,
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
  fontFamily: FONTS.body,
};

const miniBtn: React.CSSProperties = {
  padding: "5px 9px",
  borderRadius: 7,
  border: `1px solid ${COLORS.border}`,
  background: "#fff",
  color: COLORS.ink,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONTS.body,
};

const miniBtnLink: React.CSSProperties = { ...miniBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" };

const arrowBtn: React.CSSProperties = {
  width: 20,
  height: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: `1px solid ${COLORS.borderSoft}`,
  background: "#fff",
  color: COLORS.inkMuted,
  fontSize: 8,
  borderRadius: 4,
  cursor: "pointer",
  padding: 0,
  lineHeight: 1,
};
