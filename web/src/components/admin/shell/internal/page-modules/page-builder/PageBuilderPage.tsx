"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useAdminShell, COLORS, FONTS, TRANSITION } from "../../state";
import { EmptyState, Icon, PrimaryButton, SecondaryButton } from "../../primitives";
import {
  createPage,
  updatePageBlocks,
  updatePageTheme,
  updatePageMeta,
  publishPage,
  unpublishPage,
  deletePage,
  listPages,
} from "@/app/(workspace)/[tenantSlug]/admin/website/actions";
import type { PageBlock, PageTheme } from "@/components/page-builder/blocks";

type PageRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
  blocks: PageBlock[];
  theme: PageTheme;
};

type BlockTypeName = "hero" | "text" | "image" | "gallery" | "roster" | "cta";

const BLOCK_TYPE_LABELS: Record<BlockTypeName, string> = {
  hero: "Hero banner",
  text: "Text",
  image: "Image",
  gallery: "Gallery",
  roster: "Roster grid",
  cta: "Call to action",
};

function StatusPillLocal({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    published: { bg: COLORS.successSoft, fg: COLORS.successDeep },
    scheduled: { bg: COLORS.amberSoft, fg: COLORS.amberDeep },
    draft: { bg: COLORS.surfaceAlt, fg: COLORS.inkMuted },
  };
  const c = colors[status] ?? { bg: COLORS.surfaceAlt, fg: COLORS.inkMuted };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        background: c.bg,
        color: c.fg,
        fontFamily: FONTS.body,
      }}
    >
      {status}
    </span>
  );
}

function defaultBlock(type: BlockTypeName): PageBlock {
  switch (type) {
    case "hero":
      return { type: "hero", heading: "Welcome", subheading: "", ctaLabel: "Get in touch", ctaHref: "/contact" };
    case "text":
      return { type: "text", content: "Add your text here." };
    case "image":
      return { type: "image", url: "", alt: "" };
    case "gallery":
      return { type: "gallery", images: [] };
    case "roster":
      return { type: "roster", heading: "Our team", maxItems: 8 };
    case "cta":
      return { type: "cta", heading: "Ready to work together?", buttonLabel: "Contact us", buttonHref: "/contact" };
  }
}

// Inline SVG for icons not in the AdminShellIconName set
function TrashIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function BlockPropsEditor({
  block,
  onChange,
}: {
  block: PageBlock;
  onChange: (updated: PageBlock) => void;
}) {
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "7px 10px",
    borderRadius: 6,
    border: `1px solid ${COLORS.borderSoft}`,
    fontSize: 13,
    fontFamily: FONTS.body,
    background: "#fff",
    color: COLORS.ink,
    boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: COLORS.inkMuted,
    marginBottom: 4,
    fontFamily: FONTS.body,
  };
  const fieldStyle: React.CSSProperties = { marginBottom: 12 };

  if (block.type === "hero") {
    return (
      <div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Heading</label>
          <input style={inputStyle} value={block.heading} onChange={(e) => onChange({ ...block, heading: e.target.value })} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Subheading</label>
          <input style={inputStyle} value={block.subheading ?? ""} onChange={(e) => onChange({ ...block, subheading: e.target.value })} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Image URL</label>
          <input style={inputStyle} value={block.imageUrl ?? ""} placeholder="https://..." onChange={(e) => onChange({ ...block, imageUrl: e.target.value })} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>CTA Label</label>
          <input style={inputStyle} value={block.ctaLabel ?? ""} onChange={(e) => onChange({ ...block, ctaLabel: e.target.value })} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>CTA URL</label>
          <input style={inputStyle} value={block.ctaHref ?? ""} onChange={(e) => onChange({ ...block, ctaHref: e.target.value })} />
        </div>
      </div>
    );
  }
  if (block.type === "text") {
    return (
      <div style={fieldStyle}>
        <label style={labelStyle}>Content (markdown: **bold**, *italic*)</label>
        <textarea
          style={{ ...inputStyle, minHeight: 160, resize: "vertical" }}
          value={block.content}
          onChange={(e) => onChange({ ...block, content: e.target.value })}
        />
      </div>
    );
  }
  if (block.type === "image") {
    return (
      <div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Image URL</label>
          <input style={inputStyle} value={block.url} placeholder="https://..." onChange={(e) => onChange({ ...block, url: e.target.value })} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Alt text</label>
          <input style={inputStyle} value={block.alt ?? ""} onChange={(e) => onChange({ ...block, alt: e.target.value })} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Caption</label>
          <input style={inputStyle} value={block.caption ?? ""} onChange={(e) => onChange({ ...block, caption: e.target.value })} />
        </div>
      </div>
    );
  }
  if (block.type === "gallery") {
    return (
      <div style={fieldStyle}>
        <label style={labelStyle}>Image URLs (one per line)</label>
        <textarea
          style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
          value={block.images.map((img) => img.url).join("\n")}
          onChange={(e) => {
            const urls = e.target.value.split("\n").filter(Boolean);
            onChange({ ...block, images: urls.map((url) => ({ url })) });
          }}
        />
      </div>
    );
  }
  if (block.type === "roster") {
    return (
      <div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Heading</label>
          <input style={inputStyle} value={block.heading ?? ""} onChange={(e) => onChange({ ...block, heading: e.target.value })} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Max items (1–24)</label>
          <input
            style={inputStyle}
            type="number"
            min={1}
            max={24}
            value={block.maxItems ?? 8}
            onChange={(e) => onChange({ ...block, maxItems: Math.min(24, Math.max(1, Number(e.target.value))) })}
          />
        </div>
      </div>
    );
  }
  if (block.type === "cta") {
    return (
      <div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Heading</label>
          <input style={inputStyle} value={block.heading} onChange={(e) => onChange({ ...block, heading: e.target.value })} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Body text</label>
          <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={block.body ?? ""} onChange={(e) => onChange({ ...block, body: e.target.value })} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Button label</label>
          <input style={inputStyle} value={block.buttonLabel} onChange={(e) => onChange({ ...block, buttonLabel: e.target.value })} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Button URL</label>
          <input style={inputStyle} value={block.buttonHref} onChange={(e) => onChange({ ...block, buttonHref: e.target.value })} />
        </div>
      </div>
    );
  }
  return <p style={{ fontSize: 12, color: COLORS.inkMuted, fontFamily: FONTS.body }}>Select a block to edit its properties.</p>;
}

export function PageBuilderPage() {
  const { tenantSlug, toast } = useAdminShell();

  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPage, setSelectedPage] = useState<PageRow | null>(null);
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null);
  const [addBlockOpen, setAddBlockOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [saving, startSaving] = useTransition();
  const [publishing, startPublishing] = useTransition();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const loadPages = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    const res = await listPages(tenantSlug);
    if (res.ok) setPages(res.pages as PageRow[]);
    setLoading(false);
  }, [tenantSlug]);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  // Keep selectedPage in sync with pages list
  useEffect(() => {
    if (!selectedPage) return;
    const updated = pages.find((p) => p.id === selectedPage.id);
    if (updated) setSelectedPage(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  const handleCreatePage = () => {
    if (!tenantSlug) return;
    startSaving(async () => {
      const res = await createPage(tenantSlug);
      if (!res.ok) { toast(res.error); return; }
      const freshRes = await listPages(tenantSlug);
      if (freshRes.ok) {
        const freshPages = freshRes.pages as PageRow[];
        setPages(freshPages);
        const newPage = freshPages.find((p) => p.id === res.id);
        if (newPage) setSelectedPage(newPage);
      }
      toast("Page created.");
    });
  };

  const handleSaveBlocks = () => {
    if (!tenantSlug || !selectedPage) return;
    startSaving(async () => {
      const res = await updatePageBlocks(tenantSlug, selectedPage.id, selectedPage.blocks);
      if (!res.ok) { toast(res.error); return; }
      await loadPages();
      toast("Blocks saved.");
    });
  };

  const handleSaveTheme = () => {
    if (!tenantSlug || !selectedPage) return;
    startSaving(async () => {
      const res = await updatePageTheme(tenantSlug, selectedPage.id, selectedPage.theme as Record<string, string>);
      if (!res.ok) { toast(res.error); return; }
      await loadPages();
      toast("Theme saved.");
    });
  };

  const handlePublish = () => {
    if (!tenantSlug || !selectedPage) return;
    startPublishing(async () => {
      const res = await publishPage(tenantSlug, selectedPage.id);
      if (!res.ok) { toast(res.error); return; }
      await loadPages();
      toast("Page published.");
    });
  };

  const handleUnpublish = () => {
    if (!tenantSlug || !selectedPage) return;
    setConfirmUnpublish(false);
    startPublishing(async () => {
      const res = await unpublishPage(tenantSlug, selectedPage.id);
      if (!res.ok) { toast(res.error); return; }
      await loadPages();
      toast("Page unpublished.");
    });
  };

  const handleDelete = (pageId: string) => {
    if (!tenantSlug) return;
    setConfirmDelete(null);
    startSaving(async () => {
      const res = await deletePage(tenantSlug, pageId);
      if (!res.ok) { toast(res.error); return; }
      if (selectedPage?.id === pageId) setSelectedPage(null);
      await loadPages();
      toast("Page deleted.");
    });
  };

  const handleBlockChange = (updated: PageBlock) => {
    if (!selectedPage || selectedBlockIndex === null) return;
    const newBlocks = [...selectedPage.blocks];
    newBlocks[selectedBlockIndex] = updated;
    setSelectedPage({ ...selectedPage, blocks: newBlocks });
  };

  const handleAddBlock = (type: BlockTypeName) => {
    if (!selectedPage) return;
    const newBlock = defaultBlock(type);
    const newBlocks = [...selectedPage.blocks, newBlock];
    setSelectedPage({ ...selectedPage, blocks: newBlocks });
    setSelectedBlockIndex(newBlocks.length - 1);
    setAddBlockOpen(false);
  };

  const handleRemoveBlock = (idx: number) => {
    if (!selectedPage) return;
    const newBlocks = selectedPage.blocks.filter((_, i) => i !== idx);
    setSelectedPage({ ...selectedPage, blocks: newBlocks });
    if (selectedBlockIndex === idx) setSelectedBlockIndex(null);
    else if (selectedBlockIndex !== null && selectedBlockIndex > idx) setSelectedBlockIndex(selectedBlockIndex - 1);
  };

  const handleMoveBlock = (idx: number, dir: -1 | 1) => {
    if (!selectedPage) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= selectedPage.blocks.length) return;
    const newBlocks = [...selectedPage.blocks];
    [newBlocks[idx], newBlocks[newIdx]] = [newBlocks[newIdx]!, newBlocks[idx]!];
    setSelectedPage({ ...selectedPage, blocks: newBlocks });
    setSelectedBlockIndex(newIdx);
  };

  const handleSaveTitle = () => {
    if (!tenantSlug || !selectedPage) return;
    setEditingTitle(false);
    const newTitle = titleDraft.trim() || "Untitled";
    const updated = { ...selectedPage, title: newTitle };
    setSelectedPage(updated);
    startSaving(async () => {
      await updatePageMeta(tenantSlug, selectedPage.id, { title: newTitle });
      await loadPages();
    });
  };

  const previewSrc = selectedPage && tenantSlug
    ? `/${tenantSlug}/p/${selectedPage.slug}?preview=1`
    : null;

  if (selectedPage) {
    const isPublished = selectedPage.status === "published";
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: FONTS.body }}>
        {/* Editor toolbar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          borderBottom: `1px solid ${COLORS.borderSoft}`,
          background: "#fff",
          flexWrap: "wrap",
        }}>
          <button
            type="button"
            onClick={() => setSelectedPage(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.indigoDeep, fontWeight: 600, fontSize: 13, fontFamily: FONTS.body, display: "flex", alignItems: "center", gap: 4, padding: 0 }}
          >
            <ChevronLeftIcon /> Pages
          </button>
          <span style={{ color: COLORS.borderSoft }}>|</span>
          {editingTitle ? (
            <input
              autoFocus
              style={{ fontSize: 14, fontWeight: 600, border: `1px solid ${COLORS.indigoDeep}`, borderRadius: 6, padding: "4px 8px", fontFamily: FONTS.body }}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
            />
          ) : (
            <button
              type="button"
              onClick={() => { setTitleDraft(selectedPage.title); setEditingTitle(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: FONTS.body, color: COLORS.ink, padding: "4px 6px", borderRadius: 4 }}
            >
              {selectedPage.title}
            </button>
          )}
          <StatusPillLocal status={selectedPage.status} />
          <span style={{ color: COLORS.inkMuted, fontSize: 12, fontFamily: "ui-monospace,monospace" }}>
            /{tenantSlug}/p/{selectedPage.slug}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <SecondaryButton size="sm" disabled={saving} onClick={handleSaveBlocks}>
              {saving ? "Saving…" : "Save"}
            </SecondaryButton>
            {isPublished ? (
              <SecondaryButton size="sm" onClick={() => setConfirmUnpublish(true)}>
                Unpublish
              </SecondaryButton>
            ) : (
              <PrimaryButton size="sm" disabled={publishing} onClick={handlePublish}>
                {publishing ? "Publishing…" : "Publish"}
              </PrimaryButton>
            )}
          </div>
        </div>

        {/* Unpublish confirm */}
        {confirmUnpublish && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: 28, maxWidth: 380, width: "90%", fontFamily: FONTS.body }}>
              <h3 style={{ margin: "0 0 10px", fontFamily: FONTS.display, fontSize: 18 }}>Unpublish this page?</h3>
              <p style={{ margin: "0 0 20px", fontSize: 14, color: COLORS.inkMuted }}>The page will become a draft and visitors will no longer see it.</p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <SecondaryButton size="sm" onClick={() => setConfirmUnpublish(false)}>Cancel</SecondaryButton>
                <PrimaryButton size="sm" onClick={handleUnpublish}>Unpublish</PrimaryButton>
              </div>
            </div>
          </div>
        )}

        {/* Add block modal */}
        {addBlockOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: 24, maxWidth: 420, width: "90%", fontFamily: FONTS.body }}>
              <h3 style={{ margin: "0 0 16px", fontFamily: FONTS.display, fontSize: 17 }}>Add a block</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {(Object.keys(BLOCK_TYPE_LABELS) as BlockTypeName[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleAddBlock(type)}
                    style={{
                      padding: "14px 12px",
                      borderRadius: 10,
                      border: `1px solid ${COLORS.borderSoft}`,
                      background: "#fff",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: FONTS.body,
                      fontSize: 13,
                      fontWeight: 600,
                      color: COLORS.ink,
                      transition: `border-color ${TRANSITION.micro}`,
                    }}
                  >
                    {BLOCK_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 16, textAlign: "right" }}>
                <SecondaryButton size="sm" onClick={() => setAddBlockOpen(false)}>Cancel</SecondaryButton>
              </div>
            </div>
          </div>
        )}

        {/* Three-column editor */}
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 280px", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* Left: block list */}
          <div style={{ borderRight: `1px solid ${COLORS.borderSoft}`, padding: 12, overflowY: "auto", background: COLORS.surfaceAlt }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: COLORS.inkMuted }}>Blocks</span>
              <button
                type="button"
                onClick={() => setAddBlockOpen(true)}
                style={{ fontSize: 11, fontWeight: 700, color: COLORS.indigoDeep, background: "none", border: "none", cursor: "pointer", fontFamily: FONTS.body, display: "flex", alignItems: "center", gap: 3 }}
              >
                <Icon name="plus" size={12} stroke={2} /> Add
              </button>
            </div>
            {selectedPage.blocks.length === 0 ? (
              <div style={{ fontSize: 12, color: COLORS.inkMuted, textAlign: "center", marginTop: 24, lineHeight: 1.5 }}>
                No blocks yet.<br />Click <b>Add</b> to start.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {selectedPage.blocks.map((block, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedBlockIndex(idx)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${selectedBlockIndex === idx ? COLORS.indigoDeep : COLORS.borderSoft}`,
                      background: selectedBlockIndex === idx ? COLORS.indigoSoft : "#fff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      transition: `border-color ${TRANSITION.micro}`,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: selectedBlockIndex === idx ? COLORS.indigoDeep : COLORS.ink, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {BLOCK_TYPE_LABELS[block.type as BlockTypeName] ?? block.type}
                    </span>
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button type="button" onClick={(e) => { e.stopPropagation(); handleMoveBlock(idx, -1); }} disabled={idx === 0} style={{ background: "none", border: "none", cursor: idx === 0 ? "not-allowed" : "pointer", opacity: idx === 0 ? 0.3 : 0.7, padding: 2 }}>
                        <ChevronUpIcon />
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); handleMoveBlock(idx, 1); }} disabled={idx === selectedPage.blocks.length - 1} style={{ background: "none", border: "none", cursor: idx === selectedPage.blocks.length - 1 ? "not-allowed" : "pointer", opacity: idx === selectedPage.blocks.length - 1 ? 0.3 : 0.7, padding: 2 }}>
                        <Icon name="chevron-down" size={12} stroke={2} />
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveBlock(idx); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", opacity: 0.6, padding: 2 }}>
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Theme panel */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${COLORS.borderSoft}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: COLORS.inkMuted, marginBottom: 10 }}>Theme</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 12, fontFamily: FONTS.body, color: COLORS.ink }}>
                  <span style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Background</span>
                  <input
                    type="color"
                    value={(selectedPage.theme as PageTheme).backgroundColor ?? "#ffffff"}
                    onChange={(e) => setSelectedPage({ ...selectedPage, theme: { ...(selectedPage.theme as PageTheme), backgroundColor: e.target.value } })}
                    style={{ width: "100%", height: 32, border: "none", borderRadius: 6, cursor: "pointer", padding: 2 }}
                  />
                </label>
                <label style={{ fontSize: 12, fontFamily: FONTS.body, color: COLORS.ink }}>
                  <span style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Font color</span>
                  <input
                    type="color"
                    value={(selectedPage.theme as PageTheme).fontColor ?? "#111827"}
                    onChange={(e) => setSelectedPage({ ...selectedPage, theme: { ...(selectedPage.theme as PageTheme), fontColor: e.target.value } })}
                    style={{ width: "100%", height: 32, border: "none", borderRadius: 6, cursor: "pointer", padding: 2 }}
                  />
                </label>
                <label style={{ fontSize: 12, fontFamily: FONTS.body, color: COLORS.ink }}>
                  <span style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Font family</span>
                  <select
                    value={(selectedPage.theme as PageTheme).fontFamily ?? ""}
                    onChange={(e) => setSelectedPage({ ...selectedPage, theme: { ...(selectedPage.theme as PageTheme), fontFamily: e.target.value } })}
                    style={{ width: "100%", padding: "7px 8px", borderRadius: 6, border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 12, background: "#fff" }}
                  >
                    <option value="">System default</option>
                    <option value="Georgia, serif">Georgia (serif)</option>
                    <option value="'Helvetica Neue', Arial, sans-serif">Helvetica Neue</option>
                    <option value="'Inter', sans-serif">Inter</option>
                    <option value="'Playfair Display', Georgia, serif">Playfair Display</option>
                    <option value="ui-monospace, monospace">Monospace</option>
                  </select>
                </label>
                <SecondaryButton size="sm" onClick={handleSaveTheme} disabled={saving}>
                  Apply theme
                </SecondaryButton>
              </div>
            </div>
          </div>

          {/* Middle: preview iframe */}
          <div style={{ position: "relative", background: "#f3f4f6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: 16, overflowY: "auto" }}>
            {previewSrc ? (
              <>
                <div style={{ fontSize: 11, color: COLORS.inkMuted, marginBottom: 8, fontFamily: FONTS.body }}>
                  Preview — publish to see live
                </div>
                <iframe
                  src={previewSrc}
                  style={{
                    width: "100%",
                    maxWidth: 900,
                    height: 600,
                    border: "none",
                    borderRadius: 10,
                    boxShadow: "0 2px 20px rgba(0,0,0,0.10)",
                    background: "#fff",
                  }}
                  title="Page preview"
                />
              </>
            ) : (
              <div style={{ color: COLORS.inkMuted, fontSize: 13, marginTop: 40 }}>Save to preview</div>
            )}
          </div>

          {/* Right: block props */}
          <div style={{ borderLeft: `1px solid ${COLORS.borderSoft}`, padding: 16, overflowY: "auto", background: "#fff" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: COLORS.inkMuted, marginBottom: 14 }}>
              {selectedBlockIndex !== null ? `Edit: ${BLOCK_TYPE_LABELS[selectedPage.blocks[selectedBlockIndex]?.type as BlockTypeName] ?? "Block"}` : "Block properties"}
            </div>
            {selectedBlockIndex !== null && selectedPage.blocks[selectedBlockIndex] ? (
              <BlockPropsEditor
                block={selectedPage.blocks[selectedBlockIndex]}
                onChange={handleBlockChange}
              />
            ) : (
              <p style={{ fontSize: 12, color: COLORS.inkMuted, fontFamily: FONTS.body }}>
                Select a block on the left to edit its properties.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Pages list view
  return (
    <div style={{ padding: 20, fontFamily: FONTS.body }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 22, fontWeight: 600 }}>Pages</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: COLORS.inkMuted }}>
            Build and publish pages for your workspace storefront.
          </p>
        </div>
        <PrimaryButton size="sm" onClick={handleCreatePage} disabled={saving}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="plus" size={13} stroke={2} /> New page
          </span>
        </PrimaryButton>
      </div>

      {loading ? (
        <div style={{ color: COLORS.inkMuted, fontSize: 13 }}>Loading…</div>
      ) : pages.length === 0 ? (
        <EmptyState
          icon="info"
          title="No pages yet"
          body="Create your first page to publish content on your workspace storefront."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pages.map((page) => (
            <div
              key={page.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 16px",
                borderRadius: 10,
                border: `1px solid ${COLORS.borderSoft}`,
                background: "#fff",
                cursor: "pointer",
                transition: `border-color ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
              }}
              onClick={() => setSelectedPage(page)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <StatusPillLocal status={page.status} />
                  <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 11, color: COLORS.inkMuted }}>/{page.slug}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{page.title}</div>
                <div style={{ fontSize: 11, color: COLORS.inkDim, marginTop: 2 }}>
                  Last edited {new Date(page.updatedAt).toLocaleDateString()} · {page.blocks.length} block{page.blocks.length !== 1 ? "s" : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(page.id); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkMuted, opacity: 0.6, padding: 4 }}
                  title="Delete page"
                >
                  <TrashIcon />
                </button>
                <SecondaryButton
                  size="sm"
                  onClick={() => setSelectedPage(page)}
                >
                  Edit
                </SecondaryButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, maxWidth: 360, width: "90%", fontFamily: FONTS.body }}>
            <h3 style={{ margin: "0 0 10px", fontFamily: FONTS.display, fontSize: 17 }}>Delete this page?</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: COLORS.inkMuted }}>This cannot be undone. All revisions will be deleted.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <SecondaryButton size="sm" onClick={() => setConfirmDelete(null)}>Cancel</SecondaryButton>
              <PrimaryButton size="sm" onClick={() => handleDelete(confirmDelete)}>Delete</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
