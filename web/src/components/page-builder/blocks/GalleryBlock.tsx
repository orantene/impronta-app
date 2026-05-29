import type { GalleryBlock } from "./types";

export function GalleryBlockRenderer({ block }: { block: GalleryBlock }) {
  if (!block.images.length) return null;
  return (
    <section style={{ padding: "24px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        {block.images.map((img, i) => (
          <div key={i} style={{ borderRadius: 8, overflow: "hidden", aspectRatio: "1/1" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt={img.alt ?? ""}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
