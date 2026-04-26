"use client";

import { useState, type ReactNode } from "react";

import { RichEditor } from "@/components/edit-chrome/rich-editor";

interface Fixture {
  index: number;
  input: string;
  publicRender: ReactNode;
}

const ROW = {
  display: "grid",
  gridTemplateColumns: "60px 1fr 1fr 1fr",
  gap: 12,
  padding: "10px 0",
  borderBottom: "1px solid #eee",
  alignItems: "start",
} as const;

const HEADER_CELL = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#666",
  paddingBottom: 6,
} as const;

const RAW_CELL = {
  fontFamily: "ui-monospace, monospace",
  fontSize: 11,
  color: "#666",
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-all" as const,
};

export function HarnessClient({ fixtures }: { fixtures: Fixture[] }) {
  // Keep each editor's live serialized output so we can show byte-for-byte
  // round-trip status next to it.
  const [serialized, setSerialized] = useState<Record<number, string>>(() =>
    Object.fromEntries(fixtures.map((f) => [f.index, f.input])),
  );

  return (
    <section>
      <div style={ROW}>
        <span style={HEADER_CELL}>#</span>
        <span style={HEADER_CELL}>Input (raw markers)</span>
        <span style={HEADER_CELL}>Live editor</span>
        <span style={HEADER_CELL}>Public render · serialized</span>
      </div>
      {fixtures.map((f) => {
        const out = serialized[f.index] ?? f.input;
        const drift = out !== f.input;
        return (
          <div key={f.index} style={ROW}>
            <span style={{ fontSize: 11, color: "#999" }}>{f.index + 1}</span>
            <span style={RAW_CELL}>{f.input || <em style={{ color: "#bbb" }}>(empty)</em>}</span>
            <div>
              <RichEditor
                value={f.input}
                onChange={(next) =>
                  setSerialized((prev) => ({ ...prev, [f.index]: next }))
                }
                variant={f.input.includes("\n") ? "multi" : "single"}
                ariaLabel={`Fixture ${f.index + 1}`}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 14 }}>{f.publicRender}</div>
              <div style={{ ...RAW_CELL, color: drift ? "#c44" : "#999" }}>
                {drift ? `⚠ drift → ${out}` : "(byte-identical)"}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
