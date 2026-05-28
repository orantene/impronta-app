import type { CtaBlock } from "./types";

export function CtaBlockRenderer({ block }: { block: CtaBlock }) {
  return (
    <section
      style={{
        textAlign: "center",
        padding: "60px 24px",
        background: "rgba(29,78,216,0.06)",
        borderRadius: 12,
        margin: "24px 0",
      }}
    >
      <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>{block.heading}</h2>
      {block.body && (
        <p style={{ fontSize: 16, opacity: 0.72, maxWidth: 480, margin: "0 auto 24px", lineHeight: 1.6 }}>
          {block.body}
        </p>
      )}
      <a
        href={block.buttonHref}
        style={{
          display: "inline-block",
          padding: "14px 32px",
          borderRadius: 8,
          background: "#1d4ed8",
          color: "#fff",
          fontWeight: 700,
          fontSize: 15,
          textDecoration: "none",
        }}
      >
        {block.buttonLabel}
      </a>
    </section>
  );
}
