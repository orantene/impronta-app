import type { TaxonomyNode } from "@/lib/server-actions/admin-taxonomy";
import { COLORS, FONTS } from "../state";

/**
 * Display name for a taxonomy term in the reader's language.
 *
 * Every term carries a platform EN/ES pair (`name_en` / `name_es`) plus an
 * optional per-workspace override pair (`custom_label` / `custom_label_es`).
 * The drawer used to render `custom_label ?? name_en` unconditionally, so a
 * Spanish admin saw the whole category tree in English and the ES override
 * they had just typed was never shown back to them. Resolve the requested
 * locale first, then fall back through the other locale so a term with only
 * one side filled in still renders a name instead of an empty string.
 */
export function taxonomyDisplayName(
  node: { name_en: string; name_es?: string | null; custom_label?: string | null; custom_label_es?: string | null },
  isSpanish: boolean,
): string {
  if (isSpanish) {
    return node.custom_label_es || node.name_es || node.custom_label || node.name_en;
  }
  return node.custom_label || node.name_en || node.custom_label_es || node.name_es || "";
}


/**
 * One level-3 talent_type as a TOGGLE chip. Disabled leaves render faded,
 * dashed and struck through — before this, the drawer showed every leaf as an
 * inert enabled-looking chip, so a tenant's per-type curation (Impronta: 332
 * disabled leaves, 64 under fully-enabled parents) was invisible and could
 * only be changed with a DB write.
 */
export function TalentTypeToggleChip({
  node,
  isSpanish,
  onToggle,
  t,
}: {
  node: TaxonomyNode;
  isSpanish: boolean;
  onToggle: (leaf: TaxonomyNode) => void;
  t: (key: string) => string;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(node)}
      aria-pressed={node.is_enabled}
      title={t(node.is_enabled ? "dashboard.adminDrawers.taxonomyLeafOnTooltip" : "dashboard.adminDrawers.taxonomyLeafOffTooltip")}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 8px", fontSize: 11, fontFamily: FONTS.body,
        color: node.is_enabled ? COLORS.inkMuted : COLORS.inkDim,
        background: node.is_enabled ? "#fff" : "transparent",
        borderRadius: 999, cursor: "pointer",
        border: `1px ${node.is_enabled ? "solid" : "dashed"} ${node.is_enabled ? COLORS.borderSoft : COLORS.border}`,
        opacity: node.is_enabled ? 1 : 0.6,
        textDecoration: node.is_enabled ? "none" : "line-through",
      }}
    >
      <span aria-hidden style={{
        width: 6, height: 6, borderRadius: "50%",
        background: node.is_enabled ? COLORS.accent : "rgba(11,11,13,0.22)",
        flexShrink: 0,
      }} />
      {taxonomyDisplayName(node, isSpanish)}
    </button>
  );
}


/** The rare direct-under-parent leaves, rendered with the same toggle chips. */
export function DirectTalentTypeChips({
  parent,
  isSpanish,
  onToggle,
  t,
  label,
}: {
  parent: TaxonomyNode;
  isSpanish: boolean;
  onToggle: (leaf: TaxonomyNode) => void;
  t: (key: string) => string;
  label: string;
}) {
  const direct = parent.children.filter((c) => c.term_type === "talent_type" && !c.is_custom);
  if (direct.length === 0) return null;
  return (
    <div style={{
      marginBottom: 8, padding: "8px 10px", borderRadius: 8,
      background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
      fontFamily: FONTS.body,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: 0.4 }} className="text-admin-ink-muted">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {direct.map((tt) => (
          <TalentTypeToggleChip key={tt.id} node={tt} isSpanish={isSpanish} onToggle={onToggle} t={t} />
        ))}
      </div>
    </div>
  );
}
