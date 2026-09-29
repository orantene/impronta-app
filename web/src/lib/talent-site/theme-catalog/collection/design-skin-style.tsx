import { designSkinCss } from "./design-skins";

export { designComponentStyleDefaults } from "./design-skins";

/**
 * The Design skin stylesheet (`design-skins.ts`) for a slug, or nothing. The
 * canvas root must carry `data-talent-design="<slug>"` for it to apply.
 */
export function DesignSkinStyle({ slug }: { slug: string | null | undefined }) {
  const css = designSkinCss(slug);
  return css ? <style>{css}</style> : null;
}
