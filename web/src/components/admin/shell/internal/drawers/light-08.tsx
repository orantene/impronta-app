"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  COLORS,
  DrawerShell,
  FONTS,
  FieldRow,
  Icon,
  PrimaryButton,
  ReorderList,
  SecondaryButton,
  Section,
  StandardFooter,
  StateChipMini,
  TextArea,
  TextInput,
  loadAgencySettingsNamespace,
  patchAgencySettingsNamespace,
  useAdminShell,
  useQueuedRouterRefresh
} from "./drawer-shared";
import { useDashboardText } from "../dashboard-i18n";

// Phase 1d (remediation §4): 6 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function PagesDrawer() {
  const { closeDrawer } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const pages = [
    { id: "p1", title: "Home", status: "published", updated: "2d ago" },
    { id: "p2", title: "Roster", status: "published", updated: "5d ago" },
    { id: "p3", title: "About us", status: "published", updated: "1mo ago" },
    { id: "p4", title: "Contact", status: "published", updated: "2mo ago" },
    { id: "p5", title: "Press kit", status: "draft", updated: "1d ago" },
  ];
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("Pages")}
      description={tt("Static pages that complement your roster.")}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="plus" size={12} stroke={2} />
              {tt("New page")}
            </span>
          </PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        {pages.map((p) => (
          <button
            key={p.id}
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              padding: "12px 14px",
              cursor: "pointer",
              fontFamily: FONTS.body,
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div className="flex-1">
              <div className="text-admin-ink text-admin-13 font-semibold">{tt(p.title)}</div>
              <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">
                /{p.title.toLowerCase().replace(/\s/g, "-")} · {tt("updated")} {p.updated}
              </div>
            </div>
            <StateChipMini label={tt(p.status)} tone={p.status === "published" ? "green" : "dim"} />
          </button>
        ))}
      </div>
    </DrawerShell>
  );
}


export function PostsDrawer() {
  const { closeDrawer } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const posts = [
    { title: "Spring 2026 — what's moving", status: "published", at: "3d ago" },
    { title: "BTS · Vogue Italia editorial", status: "published", at: "1w ago" },
    { title: "Welcoming Tomás Navarro", status: "published", at: "2w ago" },
    { title: "Rate cards explained", status: "published", at: "1mo ago" },
    { title: "Press kit refresh", status: "draft", at: "2d ago" },
  ];
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("Posts")}
      description={tt("Editorial features, news, behind-the-scenes.")}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="plus" size={12} stroke={2} />
              {tt("New post")}
            </span>
          </PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        {posts.map((p, idx) => (
          <div
            key={idx}
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              padding: 12,
              fontFamily: FONTS.body,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="text-admin-ink text-admin-13 font-semibold">{p.title}</div>
              <StateChipMini label={tt(p.status)} tone={p.status === "published" ? "green" : "dim"} />
            </div>
            <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">{p.at}</div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}


export function NavigationDrawer() {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const { closeDrawer, toast } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const [pending, startTransition] = useTransition();
  const [headerItems, setHeaderItems] = useState<string[]>([
    "Roster", "About", "Editorial", "Press", "Contact",
  ]);
  const [col1, setCol1] = useState("Agency");
  const [col2, setCol2] = useState("Talent");
  const [col3, setCol3] = useState("Get in touch");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadAgencySettingsNamespace("", "navigation").then((r) => {
      if (cancelled) return;
      if (r.ok && r.data) {
        const v = r.data as Record<string, unknown>;
        if (Array.isArray(v.headerItems)) setHeaderItems((v.headerItems as string[]).map(String));
        if (typeof v.col1 === "string") setCol1(v.col1);
        if (typeof v.col2 === "string") setCol2(v.col2);
        if (typeof v.col3 === "string") setCol3(v.col3);
      }
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const onSave = () => {
    startTransition(async () => {
      const r = await patchAgencySettingsNamespace("", "navigation", {
        headerItems, col1, col2, col3,
      });
      if (!r.ok) toast(`${tt("Save failed")}: ${r.error}`);
      else { toast(tt("Navigation saved")); queueRouterRefresh(); closeDrawer(); }
    });
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("Navigation & footer")}
      description={tt("Header structure and footer columns.")}
      footer={<StandardFooter onSave={onSave} disabled={pending || !loaded} saveLabel={pending ? tt("Saving…") : tt("Save")} />}
    >
      <Section title={copy.isSpanish ? `Encabezado · ${headerItems.length} elementos` : `Header · ${headerItems.length} items`}>
        <ReorderList items={headerItems} />
      </Section>
      <Section title={tt("Footer · 3 columns")}>
        <FieldRow label={tt("Column 1 title")}>
          <TextInput value={col1} onChange={(e) => setCol1((e.target as HTMLInputElement).value)} />
        </FieldRow>
        <FieldRow label={tt("Column 2 title")}>
          <TextInput value={col2} onChange={(e) => setCol2((e.target as HTMLInputElement).value)} />
        </FieldRow>
        <FieldRow label={tt("Column 3 title")}>
          <TextInput value={col3} onChange={(e) => setCol3((e.target as HTMLInputElement).value)} />
        </FieldRow>
      </Section>
    </DrawerShell>
  );
}


export function MediaDrawer() {
  const { closeDrawer } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("Media library")}
      description={tt("Photos and videos. Drag-drop or upload.")}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>{tt("Upload")}</PrimaryButton>
        </>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {["🌸", "🌊", "🍃", "🌷", "🌿", "🌲", "🌹", "🌼", "🌻"].map((e, i) => (
          <div
            key={i}
            style={{
              aspectRatio: "1",
              background: COLORS.surfaceAlt,
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
            }}
          >
            {e}
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}


export function TranslationsDrawer() {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const { closeDrawer, toast } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const [pending, startTransition] = useTransition();
  const ALL = [
    { code: "EN", name: "English" },
    { code: "ES", name: "Español" },
    { code: "IT", name: "Italiano" },
    { code: "FR", name: "Français" },
  ];
  const [enabled, setEnabled] = useState<string[]>(["EN", "ES"]);
  const [primary, setPrimary] = useState<string>("EN");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadAgencySettingsNamespace("", "languages").then((r) => {
      if (cancelled) return;
      if (r.ok && r.data) {
        const v = r.data as Record<string, unknown>;
        if (Array.isArray(v.enabled)) setEnabled((v.enabled as string[]).map(String));
        if (typeof v.primary === "string") setPrimary(v.primary);
      }
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const toggle = (code: string) => {
    setEnabled((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      return [...prev, code];
    });
  };

  const onSave = () => {
    startTransition(async () => {
      const r = await patchAgencySettingsNamespace("", "languages", {
        enabled, primary,
      });
      if (!r.ok) toast(`${tt("Save failed")}: ${r.error}`);
      else { toast(tt("Languages saved")); queueRouterRefresh(); closeDrawer(); }
    });
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("Translations")}
      description={tt("Run your storefront in multiple languages.")}
      footer={<StandardFooter onSave={onSave} disabled={pending || !loaded} saveLabel={pending ? tt("Saving…") : tt("Save")} />}
    >
      <Section title={tt("Active languages")}>
        {ALL.map((l) => {
          const isOn = enabled.includes(l.code);
          const isPrimary = primary === l.code;
          return (
            <div
              key={l.code}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px", background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`, borderRadius: 8,
                fontFamily: FONTS.body,
              }}
            >
              <span style={{ fontFamily: FONTS.mono, fontSize: 11, minWidth: 24 }} className="text-admin-ink-muted">
                {l.code}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }} className="text-admin-ink">
                {l.name}
              </span>
              {isPrimary && <StateChipMini label={tt("Primary")} tone="green" />}
              {!isPrimary && isOn && (
                <button type="button" onClick={() => setPrimary(l.code)} style={{
                  fontSize: 11, fontFamily: FONTS.body, padding: "3px 8px",
                  borderRadius: 999, border: `1px solid ${COLORS.border}`,
                  background: "transparent", color: COLORS.inkMuted, cursor: "pointer",
                }}>
                  {tt("Make primary")}
                </button>
              )}
              <button type="button" onClick={() => toggle(l.code)} disabled={isPrimary && isOn} style={{
                fontSize: 11, fontFamily: FONTS.body, padding: "3px 8px",
                borderRadius: 999,
                border: `1px solid ${isOn ? COLORS.coralDeep : COLORS.border}`,
                background: "transparent",
                color: isOn ? COLORS.coralDeep : COLORS.ink,
                cursor: (isPrimary && isOn) ? "not-allowed" : "pointer",
                opacity: (isPrimary && isOn) ? 0.4 : 1,
              }}>
                {isOn ? tt("Remove") : tt("Add")}
              </button>
            </div>
          );
        })}
      </Section>
    </DrawerShell>
  );
}


export function SeoDrawer() {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const { closeDrawer, toast, effectiveTenant } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const [siteTitle, setSiteTitle] = useState(
    copy.isSpanish
      ? `${effectiveTenant.name} · Agencia de talento`
      : `${effectiveTenant.name} · Talent agency`,
  );
  const [description, setDescription] = useState(
    tt("A boutique agency representing editorial, runway, and commercial talent across Europe."),
  );
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void loadAgencySettingsNamespace("", "seo").then((r) => {
      if (cancelled) return;
      if (r.ok && r.data) {
        const v = r.data as Record<string, unknown>;
        if (typeof v.siteTitle === "string") setSiteTitle(v.siteTitle);
        if (typeof v.description === "string") setDescription(v.description);
      }
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const onSave = () => {
    startTransition(async () => {
      const r = await patchAgencySettingsNamespace("", "seo", { siteTitle, description });
      if (!r.ok) toast(`${tt("Save failed")}: ${r.error}`);
      else { toast(tt("SEO saved")); queueRouterRefresh(); closeDrawer(); }
    });
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("SEO & defaults")}
      description={tt("Meta tags, social previews, sitemap.")}
      footer={<StandardFooter onSave={onSave} disabled={pending || !loaded} saveLabel={pending ? tt("Saving…") : tt("Save")} />}
    >
      <Section title={tt("Defaults")}>
        <FieldRow label={tt("Site title")}>
          <TextInput value={siteTitle} onChange={(e) => setSiteTitle((e.target as HTMLInputElement).value)} />
        </FieldRow>
        <FieldRow label={tt("Description")}>
          <TextArea rows={2} value={description} onChange={(e) => setDescription((e.target as HTMLTextAreaElement).value)} />
        </FieldRow>
      </Section>
      <Section title={tt("Open Graph image")}>
        <div style={{ aspectRatio: "1.91", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONTS.display, fontSize: 28 }} className="bg-admin-surface-alt text-admin-ink">
          {effectiveTenant.name}
        </div>
      </Section>
      <Section title={tt("Sitemap")}>
        <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 8, padding: 12, fontFamily: FONTS.mono, fontSize: 11, lineHeight: 1.7 }} className="text-admin-ink-muted">
          /sitemap.xml<br />
          {effectiveTenant.domain}/sitemap.xml
        </div>
      </Section>
    </DrawerShell>
  );
}

// 2026 redesign — the Field Catalog answers "what fields does the profile
// already have, and how do I add agency-specific extras?". Three sections:
//   1. CORE FIELDS — built-in, read-only here. Saves admins from
//      adding duplicates of fields the profile already captures.
//   2. TYPE-SPECIFIC FIELDS — auto-rendered in the Profile Shell when a
//      talent's primary or secondary type matches. Listed grouped by type
//      so admins know what fields kick in for which roles.
//   3. CUSTOM FIELDS — agency-defined extras (Agency tier feature) with
//      a real add/edit/remove flow.

