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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { interpolate } from "@/i18n/interpolate";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS } from "./support-tokens";
import { getGuideArticleAction, guideSearchMissAction, guideSignalAction, listGuideTopicsAction } from "@/lib/guide/guide-actions";
import { tokenize } from "@/lib/support/help-corpus";
import type { GuideArticle, GuideLocale, GuideTopicSummary } from "@/lib/guide/types";
import { humanizeNodeId } from "@/lib/guide/humanize";

function useGuideLocale(): GuideLocale {
  // Dashboard locale is "en" | "es" | "fr" today; the Guide only has en/es
  // content (plan §1), so fr falls back to en rather than showing nothing.
  const locale = useDashboardLocale();
  return locale === "es" ? "es" : "en";
}

export function GuideTab({
  initialNodeId,
  onConsumedDeepLink,
  onAskSupport,
}: {
  /** Set when a caller (e.g. the (i) icon) wants the Guide to open on a specific topic. */
  initialNodeId?: string | null;
  onConsumedDeepLink?: () => void;
  /** "Ask the Guide" fallback: hands the question to the support ask box on Home. */
  onAskSupport?: (question: string) => void;
}) {
  const t = useT();
  const locale = useGuideLocale();
  const [topics, setTopics] = useState<GuideTopicSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [openNodeId, setOpenNodeId] = useState<string | null>(null);
  const [article, setArticle] = useState<GuideArticle | null>(null);
  const [loadingArticle, setLoadingArticle] = useState(false);

  useEffect(() => {
    let ignore = false;
    void listGuideTopicsAction(locale).then((list) => {
      if (!ignore) setTopics(list);
    });
    return () => {
      ignore = true;
    };
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
      setLoadingArticle(false);
      return;
    }
    // Ignore a slower earlier response landing after a newer one (open A,
    // tap Related → B; A must not overwrite B).
    let ignore = false;
    setLoadingArticle(true);
    void guideSignalAction(openNodeId, locale, "open");
    void getGuideArticleAction(openNodeId, locale).then((a) => {
      if (ignore) return;
      setArticle(a);
      setLoadingArticle(false);
    });
    return () => {
      ignore = true;
    };
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

  // Log a miss once the user has stopped typing on a query that matched nothing.
  useEffect(() => {
    if (!results || results.length > 0 || query.trim().length < 3) return;
    const handle = setTimeout(() => void guideSearchMissAction(locale, query), 1200);
    return () => clearTimeout(handle);
  }, [results, query, locale]);

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
        locale={locale}
        article={article}
        loading={loadingArticle}
        onBack={backToList}
        onOpenRelated={openArticle}
        onAskSupport={onAskSupport}
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
              <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 12.5, color: COLORS.inkMuted }}>
                  {interpolate(t("dashboard.adminSupport.guideSearchNoResults"), { query })}
                </span>
                {onAskSupport ? (
                  <button
                    type="button"
                    onClick={() => onAskSupport(query)}
                    style={{ alignSelf: "flex-start", border: "none", background: "transparent", padding: 0, fontSize: 12.5, fontWeight: 600, color: COLORS.ink, cursor: "pointer" }}
                  >
                    {t("dashboard.adminSupport.guideAskSupport")}
                  </button>
                ) : null}
              </div>
            ) : (
              results.map((r) => (
                <button
                  key={r.nodeId}
                  type="button"
                  onClick={() => {
                    void guideSignalAction(r.nodeId, locale, "search");
                    openArticle(r.nodeId);
                  }}
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
  locale,
  article,
  loading,
  onBack,
  onOpenRelated,
  onAskSupport,
}: {
  nodeId: string;
  locale: GuideLocale;
  article: GuideArticle | null;
  loading: boolean;
  onBack: () => void;
  onOpenRelated: (nodeId: string) => void;
  onAskSupport?: (question: string) => void;
}) {
  const t = useT();
  const [voted, setVoted] = useState<"yes" | "no" | null>(null);
  useEffect(() => setVoted(null), [nodeId]);
  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <BackRow onBack={onBack} />
      </div>
    );
  }
  if (!article) {
    return (
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <BackRow onBack={onBack} />
        <div style={{ fontSize: 13, color: COLORS.inkMuted }}>
          {interpolate(t("dashboard.adminSupport.guideNotFound"), { id: nodeId })}
        </div>
      </div>
    );
  }
  const { sections } = article;
  return (
    <div style={{ padding: "6px 16px 16px", display: "flex", flexDirection: "column", gap: 12, height: "100%", overflow: "auto" }}>
      <BackRow onBack={onBack} />
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {readMinutes(sections)} min
          </span>
          {article.audio.url ? <ListenButton src={article.audio.url} /> : null}
        </div>
        <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 600, color: COLORS.ink, fontFamily: FONTS.display }}>
          {article.title}
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.5, color: COLORS.ink }}>{sections.oneSentence}</p>
        {sections.whatItIsFor ? (
          <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.5, color: COLORS.inkMuted }}>{sections.whatItIsFor}</p>
        ) : null}
      </div>

      {sections.steps.length > 0 ? (
        <ol style={{ margin: 0, paddingLeft: 20, listStyle: "decimal", fontSize: 13, lineHeight: 1.6, color: COLORS.ink, display: "flex", flexDirection: "column", gap: 4 }}>
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

      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4 }}>
        <span style={{ fontSize: 12, color: COLORS.inkDim }}>
          {voted ? t("dashboard.adminSupport.guideThanks") : t("dashboard.adminSupport.guideHelpful")}
        </span>
        {!voted ? (
          <>
            <VoteButton label={t("dashboard.adminSupport.guideHelpfulYes")} onClick={() => { setVoted("yes"); void guideSignalAction(nodeId, locale, "helpful_yes"); }} />
            <VoteButton label={t("dashboard.adminSupport.guideHelpfulNo")} onClick={() => { setVoted("no"); void guideSignalAction(nodeId, locale, "helpful_no"); }} />
          </>
        ) : null}
        {onAskSupport ? (
          <button
            type="button"
            onClick={() => onAskSupport(article.title)}
            style={{ marginLeft: "auto", border: "none", background: "transparent", padding: 0, fontSize: 12, fontWeight: 600, color: COLORS.ink, cursor: "pointer" }}
          >
            {t("dashboard.adminSupport.guideAskSupport")}
          </button>
        ) : null}
      </div>

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
                {humanizeNodeId(relId)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Pre-rendered audio (scripts/guide/voice-guide-articles.mjs). Nothing is
 * synthesized here; a missing file simply hides the button.
 */
function ListenButton({ src }: { src: string }) {
  const t = useT();
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    setPlaying(false);
    ref.current?.pause();
  }, [src]);
  return (
    <>
      <audio ref={ref} src={src} preload="none" onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
      <button
        type="button"
        onClick={() => {
          const a = ref.current;
          if (!a) return;
          if (a.paused) void a.play();
          else a.pause();
        }}
        aria-pressed={playing}
        aria-label={playing ? t("dashboard.adminSupport.guidePause") : t("dashboard.adminSupport.guideListen")}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 9px 0 6px", borderRadius: 999, border: `1px solid ${COLORS.border}`, background: playing ? COLORS.ink : COLORS.card, color: playing ? "#fff" : COLORS.ink, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          {playing ? <path d="M7 5h4v14H7zM13 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}
        </svg>
        {playing ? t("dashboard.adminSupport.guidePause") : t("dashboard.adminSupport.guideListen")}
      </button>
    </>
  );
}

function VoteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ height: 26, padding: "0 10px", borderRadius: 7, border: `1px solid ${COLORS.border}`, background: COLORS.card, fontSize: 12, cursor: "pointer", color: COLORS.ink }}
    >
      {label}
    </button>
  );
}

function readMinutes(sections: GuideArticle["sections"]): number {
  const words = [sections.oneSentence, sections.whatItIsFor, sections.example, sections.whoSeesWhat ?? "", sections.careful ?? "", ...sections.steps.map((s) => s.text)]
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
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
