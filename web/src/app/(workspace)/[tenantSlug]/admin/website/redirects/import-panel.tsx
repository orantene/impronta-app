"use client";

/**
 * Bulk import — the surface a site migration actually needs.
 *
 * The parse runs on every keystroke (it's pure string work over a capped
 * paste), so the operator sees "142 ready · 3 problems" and the exact offending
 * lines BEFORE anything is written. Importing a spreadsheet and discovering
 * afterwards that row 87 was malformed is the failure mode this avoids.
 */

import { useMemo, useState } from "react";

import {
  parseRedirectImport,
  REDIRECT_IMPORT_MAX,
  type RedirectRecord,
} from "@/lib/site-admin/redirects";

import { importRedirects } from "./actions";
import { C, FONT, MONO, Btn } from "./ui";

const PLACEHOLDER = `/old-page, /new-page
/team/jane, /talent/jane-doe, 301
/summer-campaign, /campaigns/summer, 302`;

export function ImportPanel({
  tenantSlug,
  onClose,
  onImported,
}: {
  tenantSlug: string;
  onClose: () => void;
  onImported: (created: RedirectRecord[], failures: number) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverFailures, setServerFailures] = useState<
    Array<{ line: number; path: string; error: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseRedirectImport(text), [text]);
  const badLines = parsed.rows.filter((r) => !r.ok);

  const run = async () => {
    if (busy || parsed.validCount === 0) return;
    setBusy(true);
    setError(null);
    setServerFailures([]);
    const res = await importRedirects(tenantSlug, text);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Rejected lines stay on screen (the parent leaves the panel open when
    // `failures > 0`) so the operator can fix them; the rows that DID land are
    // handed up either way.
    setServerFailures(res.failures);
    onImported(res.redirects, res.failures.length);
  };

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: FONT,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Import redirects</div>
        <div style={{ fontSize: 11.5, color: C.inkMuted, flex: 1 }}>
          One per line: from, to, and an optional 301 or 302. Commas, tabs or arrows all work.
          Up to {REDIRECT_IMPORT_MAX} at a time.
        </div>
        <Btn onClick={onClose}>Close</Btn>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        spellCheck={false}
        placeholder={PLACEHOLDER}
        style={{
          width: "100%",
          padding: 12,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          fontFamily: MONO,
          fontSize: 12,
          lineHeight: 1.6,
          color: C.ink,
          resize: "vertical",
          outline: "none",
        }}
      />

      {text.trim() !== "" && (
        <div style={{ display: "flex", gap: 12, fontSize: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: C.green, fontWeight: 600 }}>{parsed.validCount} ready</span>
          {badLines.length > 0 && (
            <span style={{ color: C.amber, fontWeight: 600 }}>{badLines.length} to fix</span>
          )}
          {parsed.truncated && (
            <span style={{ color: C.amber }}>
              Only the first {REDIRECT_IMPORT_MAX} lines will be imported.
            </span>
          )}
        </div>
      )}

      {badLines.length > 0 && (
        <IssueList
          title="These lines were skipped"
          items={badLines.map((r) =>
            r.ok ? { line: 0, label: "", detail: "" } : { line: r.line, label: r.raw, detail: r.error },
          )}
        />
      )}

      {serverFailures.length > 0 && (
        <IssueList
          title="Rejected when saving"
          items={serverFailures.map((f) => ({ line: f.line, label: f.path, detail: f.error }))}
        />
      )}

      {error && <div style={{ fontSize: 12, color: C.red }}>{error}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn variant="primary" onClick={() => void run()} disabled={busy || parsed.validCount === 0}>
          {busy ? "Importing…" : `Import ${parsed.validCount || ""} redirect${parsed.validCount === 1 ? "" : "s"}`}
        </Btn>
      </div>
    </div>
  );
}

function IssueList({
  title,
  items,
}: {
  title: string;
  items: Array<{ line: number; label: string; detail: string }>;
}) {
  return (
    <div
      style={{
        background: C.amberSoft,
        border: `1px solid rgba(180,83,9,0.18)`,
        borderRadius: 8,
        padding: "8px 12px",
        maxHeight: 160,
        overflowY: "auto",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
        {title}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
        {items.map((item, i) => (
          <li key={`${item.line}-${i}`} style={{ fontSize: 11.5, color: C.ink, display: "flex", gap: 8 }}>
            <span style={{ color: C.inkDim, fontFamily: MONO, flexShrink: 0 }}>L{item.line}</span>
            <span style={{ fontFamily: MONO, color: C.inkMuted, flexShrink: 0, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.label}
            </span>
            <span style={{ color: C.amber }}>{item.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
