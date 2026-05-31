import type { TextBlock } from "./types";

export function TextBlockRenderer({ block }: { block: TextBlock }) {
  const lines = block.content.split("\n");
  return (
    <section style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ fontSize: 16, lineHeight: 1.75, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {lines.map((line, i) => {
          const bold = line.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
          const italic = bold.replace(/\*(.+?)\*/g, "<em>$1</em>");
          return (
            <span key={i}>
              {/* eslint-disable-next-line react/no-danger */}
              <span dangerouslySetInnerHTML={{ __html: italic }} />
              {i < lines.length - 1 ? <br /> : null}
            </span>
          );
        })}
      </div>
    </section>
  );
}
