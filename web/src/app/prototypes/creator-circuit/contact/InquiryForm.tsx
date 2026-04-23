"use client";

import { useState } from "react";

import { IconArrowRight, IconCheck } from "../_components/icons";

type FormMode = "brand" | "creator";

const NICHE_OPTIONS = [
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
  "Other",
];

const TYPE_OPTIONS = [
  "UGC only",
  "Influencer",
  "Hybrid (UGC + Influencer)",
  "Not sure yet",
];

const BUDGET_TIERS = [
  "Under $5K",
  "$5K – $15K",
  "$15K – $50K",
  "$50K – $150K",
  "$150K+",
];

const TIMING_OPTIONS = [
  "ASAP (in 2 weeks)",
  "This month",
  "Next 30–60 days",
  "Exploring for later",
];

const DELIVERABLE_OPTIONS = [
  "UGC videos",
  "Paid ad creative",
  "Reels / TikToks",
  "Long-form YouTube",
  "Pinterest pins",
  "Story sets",
  "Blog / newsletter",
  "On-model product stills",
];

export function InquiryForm() {
  const [mode, setMode] = useState<FormMode>("brand");
  const [submitted, setSubmitted] = useState(false);
  const [deliverables, setDeliverables] = useState<string[]>([]);

  const toggleDeliverable = (d: string) => {
    setDeliverables((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

  if (submitted) {
    return (
      <div
        style={{
          background: "var(--cc-surface)",
          border: "1px solid var(--cc-line)",
          borderRadius: "var(--cc-radius-xl)",
          padding: "clamp(48px, 6vw, 88px) clamp(28px, 4vw, 56px)",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        <span
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--cc-lime)",
            color: "var(--cc-ink)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconCheck size={28} />
        </span>
        <h2
          style={{
            fontFamily: "var(--cc-font-display)",
            fontSize: "clamp(28px, 3vw, 40px)",
            fontWeight: 600,
            letterSpacing: "-0.03em",
          }}
        >
          Got it — we&apos;ll be in touch.
        </h2>
        <p
          style={{
            fontSize: 16,
            color: "var(--cc-muted)",
            lineHeight: 1.55,
            maxWidth: 520,
          }}
        >
          {mode === "brand"
            ? "A shortlist will hit your inbox within 48 hours. If we need more detail to dial it in, we'll reply within the day."
            : "We review every application personally. Expect a reply within two weeks — yes, no, or let's stay in touch."}
        </p>
        <button
          type="button"
          className="cc-btn cc-btn--outline cc-btn--sm"
          onClick={() => {
            setSubmitted(false);
            setDeliverables([]);
          }}
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
      }}
      style={{
        background: "var(--cc-surface)",
        border: "1px solid var(--cc-line)",
        borderRadius: "var(--cc-radius-xl)",
        padding: "clamp(28px, 4vw, 48px)",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* Mode toggle */}
      <div
        style={{
          display: "inline-flex",
          background: "var(--cc-surface-warm)",
          borderRadius: "var(--cc-radius-pill)",
          padding: 4,
          alignSelf: "flex-start",
        }}
      >
        <button
          type="button"
          onClick={() => setMode("brand")}
          style={{
            padding: "10px 22px",
            borderRadius: "var(--cc-radius-pill)",
            fontSize: 14,
            fontWeight: 600,
            background: mode === "brand" ? "var(--cc-ink)" : "transparent",
            color: mode === "brand" ? "var(--cc-canvas)" : "var(--cc-muted)",
            transition: "all 200ms var(--cc-ease-soft)",
          }}
        >
          I&apos;m a brand
        </button>
        <button
          type="button"
          onClick={() => setMode("creator")}
          style={{
            padding: "10px 22px",
            borderRadius: "var(--cc-radius-pill)",
            fontSize: 14,
            fontWeight: 600,
            background: mode === "creator" ? "var(--cc-ink)" : "transparent",
            color: mode === "creator" ? "var(--cc-canvas)" : "var(--cc-muted)",
            transition: "all 200ms var(--cc-ease-soft)",
          }}
        >
          I&apos;m a creator
        </button>
      </div>

      {mode === "brand" ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            <label className="cc-form-field">
              <span className="cc-form-label">Brand name</span>
              <input
                className="cc-form-input"
                type="text"
                required
                placeholder="e.g. Ritual"
              />
            </label>
            <label className="cc-form-field">
              <span className="cc-form-label">Your name</span>
              <input
                className="cc-form-input"
                type="text"
                required
                placeholder="First &amp; last"
              />
            </label>
            <label className="cc-form-field">
              <span className="cc-form-label">Work email</span>
              <input
                className="cc-form-input"
                type="email"
                required
                placeholder="you@brand.com"
              />
            </label>
            <label className="cc-form-field">
              <span className="cc-form-label">Role</span>
              <input
                className="cc-form-input"
                type="text"
                placeholder="e.g. Head of Brand"
              />
            </label>
          </div>

          <label className="cc-form-field">
            <span className="cc-form-label">Campaign goal</span>
            <input
              className="cc-form-input"
              type="text"
              required
              placeholder="e.g. Launch SS26 drop with 8 lifestyle creators"
            />
          </label>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            <label className="cc-form-field">
              <span className="cc-form-label">Primary niche</span>
              <select className="cc-form-input" required>
                <option value="">Select niche</option>
                {NICHE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="cc-form-field">
              <span className="cc-form-label">Creator type</span>
              <select className="cc-form-input" required>
                <option value="">Select type</option>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="cc-form-field">
              <span className="cc-form-label">Target market</span>
              <input
                className="cc-form-input"
                type="text"
                placeholder="e.g. US urban, EU, global"
              />
            </label>
            <label className="cc-form-field">
              <span className="cc-form-label">Timing</span>
              <select className="cc-form-input" required>
                <option value="">Select timing</option>
                {TIMING_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="cc-form-label">Deliverables (select any)</span>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {DELIVERABLE_OPTIONS.map((d) => {
                const active = deliverables.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    className="cc-chip"
                    data-active={active || undefined}
                    onClick={() => toggleDeliverable(d)}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="cc-form-field">
            <span className="cc-form-label">Budget tier</span>
            <select className="cc-form-input" required>
              <option value="">Select range</option>
              {BUDGET_TIERS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>

          <label className="cc-form-field">
            <span className="cc-form-label">Brief (anything we should know)</span>
            <textarea
              className="cc-form-textarea"
              placeholder="Target audience, brand tone, product details, reference campaigns, non-negotiables…"
            />
          </label>
        </>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            <label className="cc-form-field">
              <span className="cc-form-label">Full name</span>
              <input
                className="cc-form-input"
                type="text"
                required
                placeholder="First &amp; last"
              />
            </label>
            <label className="cc-form-field">
              <span className="cc-form-label">Email</span>
              <input
                className="cc-form-input"
                type="email"
                required
                placeholder="you@email.com"
              />
            </label>
            <label className="cc-form-field">
              <span className="cc-form-label">Primary handle</span>
              <input
                className="cc-form-input"
                type="text"
                required
                placeholder="@handle"
              />
            </label>
            <label className="cc-form-field">
              <span className="cc-form-label">Primary platform</span>
              <select className="cc-form-input" required>
                <option value="">Select</option>
                <option>Instagram</option>
                <option>TikTok</option>
                <option>YouTube</option>
                <option>Pinterest</option>
              </select>
            </label>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            <label className="cc-form-field">
              <span className="cc-form-label">Follower count</span>
              <input
                className="cc-form-input"
                type="text"
                placeholder="e.g. 120K"
              />
            </label>
            <label className="cc-form-field">
              <span className="cc-form-label">Primary niche</span>
              <select className="cc-form-input" required>
                <option value="">Select niche</option>
                {NICHE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="cc-form-field">
              <span className="cc-form-label">Creator type</span>
              <select className="cc-form-input" required>
                <option value="">Select</option>
                <option>UGC only</option>
                <option>Influencer</option>
                <option>Hybrid (UGC + Influencer)</option>
              </select>
            </label>
            <label className="cc-form-field">
              <span className="cc-form-label">City / region</span>
              <input
                className="cc-form-input"
                type="text"
                placeholder="e.g. Brooklyn, NY"
              />
            </label>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="cc-form-label">What you deliver (select any)</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {DELIVERABLE_OPTIONS.map((d) => {
                const active = deliverables.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    className="cc-chip"
                    data-active={active || undefined}
                    onClick={() => toggleDeliverable(d)}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="cc-form-field">
            <span className="cc-form-label">Portfolio / media kit link</span>
            <input
              className="cc-form-input"
              type="url"
              required
              placeholder="https://…"
            />
          </label>

          <label className="cc-form-field">
            <span className="cc-form-label">Why Creator Circuit</span>
            <textarea
              className="cc-form-textarea"
              placeholder="Brands you&apos;ve worked with, campaigns you&apos;re proud of, and anything else you want us to know."
            />
          </label>
        </>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 8,
        }}
      >
        <span style={{ fontSize: 13, color: "var(--cc-muted)" }}>
          {mode === "brand"
            ? "Shortlist returned within 48 hours."
            : "Applications reviewed within two weeks."}
        </span>
        <button type="submit" className="cc-btn cc-btn--primary cc-btn--lg">
          {mode === "brand" ? "Send brief" : "Submit application"}
          <IconArrowRight className="cc-btn__arrow" size={16} />
        </button>
      </div>
    </form>
  );
}
