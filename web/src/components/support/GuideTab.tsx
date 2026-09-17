"use client";

/**
 * Support Guide P0 — the drawer's Guide tab: search + "Start here" list on
 * landing, one article on open. Self-contained (owns its own list/article
 * sub-navigation) so SupportPanel only needs one "guide" View state.
 *
 * Data comes from guide-actions.ts ("use server"), which reads
 * guide_articles/guide_nodes with a registry-derived fallback — see
 * guide-corpus.ts. No human reviewer produced this content (owner ruling
 * 2026-09-17, plan §3b): every article shown here already passed a
 * second-model critic pass, or is the registry-derived short version.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { interpolate } from "@/i18n/interpolate";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS } from "./support-tokens";
import { getGuideArticleAction, listGuideTopicsAction } from "@/lib/guide/guide-actions";
import { tokenize } from "@/lib/support/help-corpus";
import type { GuideArticle, GuideLocale, GuideTopicSummary } from "@/lib/guide/types";

function useGuideLocale(): GuideLocale {
  // Dashboard locale is "en" | "es" | "fr" today; the Guide only has en/es
  // content (plan §1), so fr falls back to en rather than showing nothing.
  const locale = useDashboardLocale();
  return locale === "es" ? "es" : "en";
}

export function GuideTab({
  initialNodeId,
  onConsumedDeepLink,
}: {
  /** Set when a caller (e.g. the (i) icon) wants the Guide to open on a specific topic. */
  initialNodeId?: string | null;
  onConsumedDeepLink?: () => void;
}) {
  const t = useT();
  const locale = useGuideLocale();
  const [topics, setTopics] = useState<GuideTopicSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [openNodeId, setOpenNodeId] = useState<string | null>(null);
  const [article, setArticle] = useState<GuideArticle | null>(null);
  const [loadingArticle, setLoadingArticle] = useState(false);

  useEffect(() => {
    void listGuideTopicsAction(locale).then(setTopics);
  }, [locale]);

  useEffect(() => {
    if (initialNodeId) {
      setOpenNodeId(initialNodeId);
      onConsumedDeepLink?.();
    }
    // onConsumedDeepLink may be a fresh function each render (SupportPanel
    // passes an inline arrow); safe to depend on it here because the guard
    // above only fires while initialNodeId is truthy, and consuming it sets
    // that back to null in the parent, so an extra re-run is a no-op.
  }, [initialNodeId, onConsumedDeepLink]);

  useEffect(() => {
    if (!openNodeId) {
      setArticle(null);
      return;
    }
    setLoadingArticle(true);
    void getGuideArticleAction(openNodeId, locale).then((a) => {
      setArticle(a);
      setLoadingArticle(false);
    });
  }, [openNodeId, locale]);

  const results = useMemo(() => {
    if (!topics || !query.trim()) return null;
    const q = tokenize(query);
    if (q.length === 0) return null;
    return topics
      .filter((topic) => {
        const hay = tokenize(`${topic.title} ${topic.oneSentence} ${topic.category}`);
        return q.every((term) => hay.some((h) => h.includes(term)));
      })
      .slice(0, 8);
  }, [topics, query]);

  const categories = useMemo(() => {
    if (!topics) return [];
    return [...new Set(topics.map((topic) => topic.category))].sort((a, b) => a.localeCompare(b));
  }, [topics]);

  const openArticle = useCallback((nodeId: string) => setOpenNodeId(nodeId), []);
  const backToList = useCallback(() => setOpenNodeId(null), []);

  if (openNodeId) {
    return (
      <GuideArticleView
        nodeId={openNodeId}
        article={article}
        loading={loadingArticle}
        onBack={backToList}
        onOpenRelated={openArticle}
      />
    );
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16, height: "100%", overflow: "auto" }} data-guide-id="support.guide-tab">
      <div>
        <div style={{ fontFamily: FONTS.display, fontSize: 19, fontWeight: 600, color: COLORS.ink }}>
          {t("dashboard.adminSupport.guideGreeting")}
        </div>
        <div style={{ fontSize: 13, color: COLORS.inkMuted, marginTop: 4 }}>
          {t("dashboard.adminSupport.guideSubline")}
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 40,
            padding: "0 12px",
            border: `1.5px solid ${COLORS.ink}`,
            borderRadius: 11,
            background: COLORS.card,
          }}
        >
          <Icon name="search" size={16} color={COLORS.ink} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("dashboard.adminSupport.guideSearchPlaceholder")}
            aria-label={t("dashboard.adminSupport.guideSearchPlaceholder")}
            style={{ flex: 1, border: "none", outline: "none", fontSize: 14, color: COLORS.ink, background: "transparent" }}
          />
        </div>
        {results ? (
          <div
            role="listbox"
            style={{
              position: "absolute",
              top: 44,
              left: 0,
              right: 0,
              zIndex: 2,
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              boxShadow: "0 12px 32px rgba(11,11,13,0.14)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              maxHeight: 280,
              overflowY: "auto",
            }}
          >
            {results.length === 0 ? (
              <div style={{ padding: "10px 12px", fontSize: 12.5, color: COLORS.inkMuted }}>
                {interpolate(t("dashboard.adminSupport.guideSearchNoResults"), { query })}
              </div>
            ) : (
              results.map((r) => (
                <button
                  key={r.nodeId}
                  type="button"
                  onClick={() => openArticle(r.nodeId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 12px",
                    border: "none",
                    background: "transparent",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 13, color: COLORS.ink, flex: 1 }}>{r.title}</span>
                  <span style={{ fontSize: 11, color: COLORS.inkMuted }}>{r.category}</span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: COLORS.inkMuted,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            padding: "0 8px 4px",
          }}
        >
          {t("dashboard.adminSupport.guideStartHere")}
        </span>
        {(topics ?? []).slice(0, 8).map((topic) => (
          <TopicRow key={topic.nodeId} topic={topic} onOpen={() => openArticle(topic.nodeId)} />
        ))}
      </div>

      {categories.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.inkMuted,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              padding: "0 8px",
            }}
          >
            {t("dashboard.adminSupport.guideBrowseByArea")}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 8px" }}>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setQuery(c)}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: COLORS.ink,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 999,
                  padding: "5px 11px",
                  background: COLORS.card,
                  cursor: "pointer",
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TopicRow({ topic, onOpen }: { topic: GuideTopicSummary; onOpen: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "10px 8px",
        border: "none",
        background: "transparent",
        borderRadius: 10,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: COLORS.surfaceAlt,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name="book" size={15} color={COLORS.ink} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{topic.title}</span>
        <span
          style={{
            fontSize: 12,
            color: COLORS.inkMuted,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {topic.oneSentence}
        </span>
      </span>
      {topic.isShortVersion ? (
        <span
          title={t("dashboard.adminSupport.guideShortVersionNote")}
          style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.amber, flexShrink: 0 }}
        />
      ) : null}
      <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
    </button>
  );
}

function GuideArticleView({
  nodeId,
  article,
  loading,
  onBack,
  onOpenRelated,
}: {
  nodeId: string;
  article: GuideArticle | null;
  loading: boolean;
  onBack: () => void;
  onOpenRelated: (nodeId: string) => void;
}) {
  const t = useT();
  if (loading || !article) {
    return (
      <div style={{ padding: 16 }}>
        <BackRow onBack={onBack} />
      </div>
    );
  }
  const { sections } = article;
  return (
    <div style={{ padding: "6px 16px 16px", display: "flex", flexDirection: "column", gap: 12, height: "100%", overflow: "auto" }}>
      <BackRow onBack={onBack} />
      <div>
        <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 600, color: COLORS.ink, fontFamily: FONTS.display }}>
          {sections.oneSentence}
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.5, color: COLORS.inkMuted }}>{sections.whatItIsFor}</p>
      </div>

      {sections.steps.length > 0 ? (
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: COLORS.ink, display: "flex", flexDirection: "column", gap: 4 }}>
          {sections.steps.map((step, i) => (
            <li key={i}>{step.text}</li>
          ))}
        </ol>
      ) : null}

      {sections.example ? (
        <div style={{ padding: "12px 14px", borderRadius: 12, background: COLORS.surfaceAlt, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.inkMuted, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            {t("dashboard.adminSupport.guideExample")}
          </span>
          <span style={{ fontSize: 13, lineHeight: 1.5, color: COLORS.ink }}>{sections.example}</span>
        </div>
      ) : null}

      {sections.whoSeesWhat ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>{t("dashboard.adminSupport.guideWhoSeesWhat")}</span>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: COLORS.inkMuted }}>{sections.whoSeesWhat}</p>
        </div>
      ) : null}

      {sections.careful ? (
        <div style={{ padding: "10px 12px", borderRadius: 10, background: COLORS.amberSoft, fontSize: 12.5, lineHeight: 1.45, color: COLORS.amberDeep }}>
          <b style={{ fontWeight: 600 }}>{t("dashboard.adminSupport.guideCareful")}. </b>
          {sections.careful}
        </div>
      ) : null}

      {article.status === "short-version" ? (
        <div style={{ fontSize: 11.5, color: COLORS.inkDim, fontStyle: "italic" }}>
          {t("dashboard.adminSupport.guideShortVersionNote")}
        </div>
      ) : null}

      {sections.related.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkMuted, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {t("dashboard.adminSupport.guideRelated")}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {sections.related.map((relId) => (
              <button
                key={relId}
                type="button"
                onClick={() => onOpenRelated(relId)}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: COLORS.ink,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 999,
                  padding: "5px 11px",
                  background: COLORS.card,
                  cursor: "pointer",
                }}
              >
                {relId}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BackRow({ onBack }: { onBack: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onBack}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: 0,
        fontSize: 12,
        color: COLORS.inkMuted,
      }}
    >
      <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
        <Icon name="chevron-right" size={13} color={COLORS.inkMuted} />
      </span>
      {t("dashboard.adminSupport.guideBack")}
    </button>
  );
}
