"use client";

// ============================================================================
// language-add-search.tsx — LanguageAddSearch + COMMON_LANGUAGES
//
// Simple searchable multi-select for adding languages. The list mirrors the
// server's LANG_CODE map (talent-profile-shell-persistence.ts) so codes stay
// consistent — this is a UI picker list, NOT a new language taxonomy.
// The parent owns the write (one setAll); we just hand up {code,name}.
// ============================================================================

import { useState } from "react";

import { useDashboardText } from "./dashboard-i18n";
import { F_BODY, T } from "./skill-tokens";

export const COMMON_LANGUAGES: Array<{ code: string; name: string }> = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "it", name: "Italian" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "ru", name: "Russian" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "ko", name: "Korean" },
  { code: "tr", name: "Turkish" },
  { code: "pl", name: "Polish" },
  { code: "sv", name: "Swedish" },
  { code: "no", name: "Norwegian" },
  { code: "da", name: "Danish" },
  { code: "fi", name: "Finnish" },
  { code: "el", name: "Greek" },
  { code: "ca", name: "Catalan" },
  { code: "eu", name: "Basque" },
  { code: "gl", name: "Galician" },
  { code: "ro", name: "Romanian" },
  { code: "uk", name: "Ukrainian" },
  { code: "cs", name: "Czech" },
  { code: "hu", name: "Hungarian" },
  { code: "th", name: "Thai" },
  { code: "vi", name: "Vietnamese" },
  { code: "id", name: "Indonesian" },
  { code: "ms", name: "Malay" },
  { code: "he", name: "Hebrew" },
  { code: "fa", name: "Persian" },
];

export function LanguageAddSearch({
  existingCodes,
  onClose,
  onAdded,
}: {
  existingCodes: Set<string>;
  onClose: () => void;
  onAdded: (
    picked: Array<{ code: string; name: string }>,
  ) => void | Promise<void>;
}) {
  const copy = useDashboardText();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const q = query.trim().toLowerCase();
  const list = COMMON_LANGUAGES.filter(
    (l) => !q || l.name.toLowerCase().includes(q) || l.code.includes(q),
  );

  const toggle = (code: string) => {
    if (existingCodes.has(code)) return;
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  };

  const submit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    const picked = COMMON_LANGUAGES.filter((l) => selected.has(l.code));
    await onAdded(picked);
    setSubmitting(false);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: "rgba(11,11,13,0.45)",
        fontFamily: F_BODY,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.surface,
          borderRadius: "16px 16px 0 0",
          maxWidth: 520,
          width: "100%",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 20px 12px",
            borderBottom: `1px solid ${T.borderSoft}`,
          }}
        >
          <div
            style={{ fontSize: 18, fontWeight: 700, color: T.ink, marginBottom: 2 }}
          >
            {copy.t("Add languages")}
          </div>
          <div style={{ fontSize: 12, color: T.inkMuted }}>
            {copy.t("Add the languages this talent speaks.")}
          </div>
        </div>

        <div
          style={{
            padding: "10px 16px",
            borderBottom: `1px solid ${T.borderSoft}`,
          }}
        >
          <input
            autoFocus
            placeholder={copy.t("Search…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              fontSize: 13,
              fontFamily: F_BODY,
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
          <div className="flex flex-wrap gap-1.5">
            {list.map((l) => {
              const already = existingCodes.has(l.code);
              const sel = selected.has(l.code);
              return (
                <button
                  key={l.code}
                  type="button"
                  disabled={already}
                  onClick={() => toggle(l.code)}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 999,
                    border: `1.5px solid ${
                      sel ? T.accent : already ? T.borderSoft : T.border
                    }`,
                    background: sel
                      ? T.accentSoft
                      : already
                        ? T.surfaceAlt
                        : T.surface,
                    color: sel ? T.accent : already ? T.inkMuted : T.ink,
                    cursor: already ? "default" : "pointer",
                    opacity: already ? 0.55 : 1,
                    fontFamily: F_BODY,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {sel ? "✓ " : ""}
                  {l.name}
                  {already ? ` · ${copy.t("on profile")}` : ""}
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            padding: "12px 16px",
            borderTop: `1px solid ${T.borderSoft}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          {selected.size > 0 && (
            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                border: "none",
                background: submitting ? T.inkMuted : T.accent,
                color: "#fff",
                cursor: submitting ? "not-allowed" : "pointer",
                fontFamily: F_BODY,
              }}
            >
              {submitting
                ? copy.t("Adding…")
                : `${copy.t("Add")} ${selected.size}`}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              background: T.surface,
              color: T.inkMuted,
              cursor: "pointer",
              fontFamily: F_BODY,
            }}
          >
            {copy.t("Close")}
          </button>
        </div>
      </div>
    </div>
  );
}
