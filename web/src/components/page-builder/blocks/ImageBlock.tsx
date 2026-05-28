import type { ImageBlock } from "./types";

export function ImageBlockRenderer({ block }: { block: ImageBlock }) {
  if (!block.url) return null;
  return (
    <section style={{ padding: "24px", textAlign: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={block.url}
        alt={block.alt ?? ""}
        style={{ maxWidth: "100%", borderRadius: 8, display: "inline-block" }}
      />
      {block.caption && (
        <p style={{ marginTop: 10, fontSize: 13, opacity: 0.65, fontStyle: "italic" }}>
          {block.caption}
        </p>
      )}
    </section>
  );
}
