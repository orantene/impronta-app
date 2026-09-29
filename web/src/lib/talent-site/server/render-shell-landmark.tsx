import type { ReactNode } from "react";

import type { BuilderNode } from "@/lib/site-admin/builder-node";
import { getSectionType } from "@/lib/site-admin/sections/registry";
import { localiseTalentHeaderDefaults } from "@/lib/talent-site/header-cta-locale";

/** True for a `site_header` / `site_footer` section landmark root. */
export function isTalentShellLandmark(node: BuilderNode): boolean {
  if (node.kind !== "section") return false;
  const key = (node.props as { sectionTypeKey?: unknown }).sectionTypeKey;
  return key === "site_header" || key === "site_footer";
}

/**
 * Render a shell landmark (`site_header` / `site_footer` section node) through
 * its bespoke section Component, exactly as the live talent site does. The
 * shared freeform renderer returns null for `kind: "section"`, so without this
 * the theme preview showed no header at all. Null when the config does not
 * parse (never a thrown render).
 */
export function renderTalentShellLandmark(
  node: BuilderNode,
  ctx: { locale: string; tenantId: string | null; publicPathPrefix?: string },
): ReactNode {
  if (!isTalentShellLandmark(node) || node.kind !== "section") return null;
  const key = node.props.sectionTypeKey;
  const entry = getSectionType(key);
  const schema = entry?.schemasByVersion[entry.currentVersion];
  const parsed = schema?.safeParse(
    localiseTalentHeaderDefaults(node.props.sectionProps ?? {}, ctx.locale),
  );
  if (!entry || !parsed?.success) return null;
  const Comp = entry.Component;
  return (
    <div key={node.id} data-talent-shell-landmark={key}>
      <Comp
        sectionId={node.id}
        tenantId={ctx.tenantId ?? ""}
        locale={ctx.locale}
        preview={false}
        props={parsed.data}
        publicPathPrefix={ctx.publicPathPrefix ?? ""}
      />
    </div>
  );
}
