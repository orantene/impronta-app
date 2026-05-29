import type { HeroBlock } from "./types";

export function HeroBlockRenderer({ block }: { block: HeroBlock }) {
  return (
    <section
      style={{
        position: "relative",
        minHeight: 320,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "80px 24px",
        background: block.imageUrl
          ? `linear-gradient(rgba(0,0,0,0.40),rgba(0,0,0,0.40)) center/cover, url(${block.imageUrl})`
          : "linear-gradient(135deg,#1d4ed8,#2563eb)",
        color: "#fff",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: "clamp(28px,5vw,56px)",
            fontWeight: 700,
            lineHeight: 1.15,
            margin: "0 0 16px",
            letterSpacing: -0.5,
          }}
        >
          {block.heading}
        </h1>
        {block.subheading && (
          <p style={{ fontSize: 18, opacity: 0.88, margin: "0 0 28px", lineHeight: 1.5 }}>
            {block.subheading}
          </p>
        )}
        {block.ctaLabel && block.ctaHref && (
          <a
            href={block.ctaHref}
            style={{
              display: "inline-block",
              padding: "14px 32px",
              borderRadius: 8,
              background: "#fff",
              color: "#1d4ed8",
              fontWeight: 700,
              fontSize: 15,
              textDecoration: "none",
              transition: "opacity 120ms",
            }}
          >
            {block.ctaLabel}
          </a>
        )}
      </div>
    </section>
  );
}
