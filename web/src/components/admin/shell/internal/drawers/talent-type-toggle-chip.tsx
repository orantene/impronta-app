import type { TaxonomyNode } from "@/lib/server-actions/admin-taxonomy";

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
      className={
        node.is_enabled
          ? "inline-flex cursor-pointer items-center gap-[5px] rounded-full border border-solid border-admin-border-soft bg-white px-2 py-[3px] font-admin-body text-admin-11 text-admin-ink-muted"
          : "inline-flex cursor-pointer items-center gap-[5px] rounded-full border border-dashed border-admin-border bg-transparent px-2 py-[3px] font-admin-body text-admin-11 text-admin-ink-dim line-through opacity-60"
      }
    >
      <span
        aria-hidden
        className={
          node.is_enabled
            ? "size-[6px] shrink-0 rounded-full bg-admin-accent"
            : "size-[6px] shrink-0 rounded-full bg-admin-ink-dim/60"
        }
      />
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
    <div className="mb-2 rounded-lg border border-admin-border-soft bg-white px-2.5 py-2 font-admin-body">
      <div className="mb-1.5 text-admin-11 font-bold tracking-[0.4px] text-admin-ink-muted">
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
