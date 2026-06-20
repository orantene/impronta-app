"use client";

/**
 * TemplateManager shared UI — the theme tokens, option vocabularies, the
 * `DraftForm` shape, the small presentational primitives (Field / Pill /
 * GhostBtn / PrimaryBtn) and their style consts, plus the pure form helpers.
 * Split out of `template-manager.tsx` so the controller, the row card, and the
 * metadata form all share one source and the file stays under the 800-line
 * `max-lines` cap. Behavior-identical to the originals.
 */
import type { CSSProperties, ReactNode } from "react";

import type {
  BuilderGalleryTab,
  BuilderTemplateKind,
  BuilderTemplateRow,
  BuilderTemplateStatus,
  BuilderTemplateTarget,
} from "@/lib/site-admin/builder-core/templates/registry-rows";

export const T = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  accent: "#5DD3A0",
  amber: "#9BA8B7",
  red: "#F36772",
};

export const KINDS: BuilderTemplateKind[] = [
  "element",
  "section",
  "connected",
  "page_template",
  "starter_kit",
  // A7 follow-up — shell templates are platform-authored here; they surface
  // ONLY on the shell-surface gallery (gated by allowedTabs) + apply to a
  // tenant's site_shell via applyShellTemplateToTenant.
  "shell_header",
  "shell_footer",
];
export const GALLERY_TABS: BuilderGalleryTab[] = [
  "sections",
  "elements",
  "connected",
  "page_templates",
  "shell",
];
export const TARGETS: BuilderTemplateTarget[] = ["talent", "workspace", "both", "platform"];
export const PLANS = ["free", "studio", "agency", "network"] as const;
export const STATUS_FILTERS: Array<BuilderTemplateStatus | "all"> = [
  "all",
  "draft",
  "in_review",
  "published",
  "archived",
];

export type DraftForm = {
  kind: BuilderTemplateKind;
  title: string;
  slug: string;
  description: string;
  category: string;
  gallery_tab: BuilderGalleryTab;
  target_context: BuilderTemplateTarget;
  required_plan: (typeof PLANS)[number];
  tags: string;
};

export const EMPTY_DRAFT: DraftForm = {
  kind: "section",
  title: "",
  slug: "",
  description: "",
  category: "general",
  gallery_tab: "sections",
  target_context: "both",
  required_plan: "free",
  tags: "",
};

export const input: CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: `1px solid ${T.border}`,
  background: T.cardSoft,
  color: T.ink,
  fontSize: 12.5,
  outline: "none",
};

export const ghostBase: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: `1px solid ${T.border}`,
  background: "transparent",
  color: T.ink,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
};

export const primaryBtn: CSSProperties = {
  padding: "6px 13px",
  borderRadius: 8,
  border: "none",
  background: T.accent,
  color: "#0F0F11",
  fontSize: 11.5,
  fontWeight: 700,
  cursor: "pointer",
};

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: T.inkMuted }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export function Pill({
  children,
  tone,
  title,
}: {
  children: ReactNode;
  tone?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      style={{
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        color: tone ?? T.inkMuted,
        padding: "2px 7px",
        borderRadius: 999,
        background: T.cardSoft,
      }}
    >
      {children}
    </span>
  );
}

export function GhostBtn({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ ...ghostBase, color: tone === "danger" ? T.red : T.ink, cursor: disabled ? "default" : "pointer" }}
    >
      {children}
    </button>
  );
}

export function PrimaryBtn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ ...primaryBtn, cursor: disabled ? "default" : "pointer" }}>
      {children}
    </button>
  );
}

export function rowToForm(row: BuilderTemplateRow): DraftForm {
  return {
    kind: row.kind,
    title: row.title,
    slug: row.slug,
    description: row.description ?? "",
    category: row.category,
    gallery_tab: row.gallery_tab,
    target_context: row.target_context,
    required_plan: row.required_plan,
    tags: row.tags.join(", "),
  };
}

export function splitTags(s: string): string[] {
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
