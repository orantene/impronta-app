"use client";

import { useMemo, useState } from "react";

import { CreatorCard } from "../_components/CreatorCard";
import { IconSearch } from "../_components/icons";
import { Reveal } from "../_components/Reveal";
import { type Creator } from "../_data/creators";

type CreatorType = "all" | "UGC" | "Influencer" | "Hybrid";
type Platform = "all" | "Instagram" | "TikTok" | "YouTube" | "Pinterest";
type AudienceSize =
  | "all"
  | "micro" // < 50k
  | "mid" // 50k – 250k
  | "mega" // 250k – 1M
  | "celebrity"; // > 1M

const NICHE_FILTERS = [
  "All",
  "Beauty",
  "Fashion",
  "Travel",
  "Food",
  "Wellness",
  "Tech",
  "Lifestyle",
  "Parenting",
  "Fitness",
  "Home",
];

const PLATFORM_FILTERS: Platform[] = ["all", "Instagram", "TikTok", "YouTube", "Pinterest"];

const TYPE_FILTERS: { key: CreatorType; label: string }[] = [
  { key: "all", label: "All types" },
  { key: "UGC", label: "UGC only" },
  { key: "Influencer", label: "Influencer" },
  { key: "Hybrid", label: "UGC + Influencer" },
];

const AUDIENCE_FILTERS: { key: AudienceSize; label: string }[] = [
  { key: "all", label: "Any size" },
  { key: "micro", label: "Micro · <50K" },
  { key: "mid", label: "Mid · 50–250K" },
  { key: "mega", label: "Mega · 250K–1M" },
  { key: "celebrity", label: "Celebrity · 1M+" },
];

const DELIVERABLE_FILTERS = [
  "All",
  "UGC videos",
  "Paid ad creative",
  "Reels",
  "Long-form YouTube",
  "Pinterest pins",
  "Story sets",
];

function audienceBucket(total: number): AudienceSize {
  if (total < 50_000) return "micro";
  if (total < 250_000) return "mid";
  if (total < 1_000_000) return "mega";
  return "celebrity";
}

export function DirectoryClient({ creators }: { creators: Creator[] }) {
  const [query, setQuery] = useState("");
  const [niche, setNiche] = useState("All");
  const [type, setType] = useState<CreatorType>("all");
  const [platform, setPlatform] = useState<Platform>("all");
  const [audience, setAudience] = useState<AudienceSize>("all");
  const [deliverable, setDeliverable] = useState("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return creators.filter((c) => {
      if (niche !== "All" && !c.niches.includes(niche)) return false;
      if (type !== "all" && c.type !== type) return false;
      if (platform !== "all" && !c.platforms.some((p) => p.platform === platform)) return false;
      if (audience !== "all" && audienceBucket(c.headlineFollowers) !== audience) return false;
      if (deliverable !== "All" && !c.deliverables.includes(deliverable)) return false;
      if (q.length > 0) {
        const hay = `${c.name} ${c.handle} ${c.city} ${c.niches.join(" ")} ${c.role}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [creators, query, niche, type, platform, audience, deliverable]);

  const reset = () => {
    setQuery("");
    setNiche("All");
    setType("all");
    setPlatform("all");
    setAudience("all");
    setDeliverable("All");
  };

  const activeCount = [
    niche !== "All",
    type !== "all",
    platform !== "all",
    audience !== "all",
    deliverable !== "All",
    query.length > 0,
  ].filter(Boolean).length;

  return (
    <>
      <Reveal>
        <div style={{ position: "relative", marginBottom: 24 }}>
          <span
            style={{
              position: "absolute",
              left: 22,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--cc-muted)",
            }}
          >
            <IconSearch size={18} />
          </span>
          <input
            className="cc-search-input"
            style={{ paddingLeft: 52 }}
            placeholder="Search creators by name, handle, niche, or city…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
          />
        </div>
      </Reveal>

      {/* Niche strip — always visible */}
      <Reveal delay={1}>
        <div className="cc-strip" style={{ marginBottom: 24 }}>
          {NICHE_FILTERS.map((n) => (
            <button
              key={n}
              type="button"
              className={`cc-chip${n === niche ? " cc-chip" : ""}`}
              data-active={n === niche || undefined}
              onClick={() => setNiche(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </Reveal>

      {/* Filter groups */}
      <Reveal delay={2}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
            marginBottom: 28,
          }}
        >
          <div className="cc-filter-group">
            <span className="cc-filter-group__label">Creator type</span>
            <div className="cc-filter-chips">
              {TYPE_FILTERS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className="cc-chip"
                  data-active={type === t.key || undefined}
                  onClick={() => setType(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="cc-filter-group">
            <span className="cc-filter-group__label">Platform</span>
            <div className="cc-filter-chips">
              {PLATFORM_FILTERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="cc-chip"
                  data-active={platform === p || undefined}
                  onClick={() => setPlatform(p)}
                >
                  {p === "all" ? "Any platform" : p}
                </button>
              ))}
            </div>
          </div>

          <div className="cc-filter-group">
            <span className="cc-filter-group__label">Audience size</span>
            <div className="cc-filter-chips">
              {AUDIENCE_FILTERS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  className="cc-chip"
                  data-active={audience === a.key || undefined}
                  onClick={() => setAudience(a.key)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="cc-filter-group">
            <span className="cc-filter-group__label">Deliverable</span>
            <div className="cc-filter-chips">
              {DELIVERABLE_FILTERS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="cc-chip"
                  data-active={deliverable === d || undefined}
                  onClick={() => setDeliverable(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 24,
        }}
      >
        <p style={{ fontSize: 14, color: "var(--cc-muted)" }}>
          <strong style={{ color: "var(--cc-ink)" }}>{filtered.length}</strong> creator
          {filtered.length === 1 ? "" : "s"}
          {activeCount > 0 ? ` · ${activeCount} filter${activeCount === 1 ? "" : "s"} active` : ""}
        </p>
        {activeCount > 0 ? (
          <button
            type="button"
            className="cc-btn cc-btn--sm cc-btn--ghost"
            onClick={reset}
          >
            Reset filters
          </button>
        ) : null}
      </div>

      {filtered.length > 0 ? (
        <div className="cc-grid-creators">
          {filtered.map((c, i) => (
            <Reveal key={c.slug} delay={(i % 4) as 0 | 1 | 2 | 3}>
              <CreatorCard creator={c} />
            </Reveal>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: "64px 32px",
            textAlign: "center",
            borderRadius: "var(--cc-radius-lg)",
            background: "var(--cc-surface)",
            border: "1px solid var(--cc-line)",
          }}
        >
          <h3
            style={{
              fontSize: 22,
              marginBottom: 8,
              letterSpacing: "-0.02em",
            }}
          >
            No creators match that brief yet.
          </h3>
          <p style={{ fontSize: 14, color: "var(--cc-muted)", marginBottom: 24 }}>
            Adjust your filters or reset — or tell us about your campaign and we&apos;ll
            source creators to fit.
          </p>
          <button
            type="button"
            className="cc-btn cc-btn--violet"
            onClick={reset}
          >
            Reset filters
          </button>
        </div>
      )}
    </>
  );
}
