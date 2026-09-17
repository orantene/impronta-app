/**
 * Header announcement + LUMINA nav link — owner request 2026-09-17.
 *
 * 1. The utility-bar text ("Casting across the Riviera Maya") becomes a LINK
 *    to the launch event: "21 November · LUMINA launch party · Get your ticket".
 * 2. With --drop-lumina, "LUMINA" leaves the primary nav. Off by default:
 *    the owner's other editor re-added it minutes after the first run, and a
 *    re-run must never fight a hand edit.
 *
 * Applied to the LIVE shell rows (both locales) by node id, then the shell
 * snapshot is republished through the editor's own publish function.
 *
 *   npx tsx scripts/impronta-rebuild/shell/announcement-patch.ts [--apply] [--drop-lumina]
 *   env ANNOUNCEMENT_EN / ANNOUNCEMENT_ES / ANNOUNCEMENT_HREF override the copy.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { commitPageRevisionThenVersion } from "@/lib/site-admin/server/page-revision-commit";
import { republishSiteShellSnapshot } from "@/lib/site-admin/edit-mode/site-shell-publish";

type Locale = "en" | "es";

const COPY: Record<Locale, { text: string; href: string }> = {
  en: {
    text: process.env.ANNOUNCEMENT_EN ?? "21 November · LUMINA launch party · Get your ticket",
    href: process.env.ANNOUNCEMENT_HREF ?? "/lumina",
  },
  es: {
    text: process.env.ANNOUNCEMENT_ES ?? "21 de noviembre · Fiesta de lanzamiento LUMINA · Consigue tu boleto",
    href: `/es${process.env.ANNOUNCEMENT_HREF ?? "/lumina"}`,
  },
};

export function patchShellAnnouncement(live: BuilderNode[], locale: Locale, opts: { dropLumina?: boolean } = {}): { tree: BuilderNode[]; changed: string[] } {
  const changed: string[] = [];
  const copyId = `shellhdr-${locale}-utility-copy`;
  const walk = (nodes: BuilderNode[]): BuilderNode[] =>
    nodes.map((node) => {
      if (node.id === copyId && (node.kind === "paragraph" || node.kind === "button")) {
        const props = node.props as Record<string, unknown>;
        const style = (props.style as Record<string, unknown>) ?? {};
        const want = COPY[locale];
        if (node.kind === "button" && props.label === want.text && props.href === want.href) return node;
        changed.push("announcement");
        return {
          id: node.id,
          kind: "button",
          props: {
            label: want.text,
            href: want.href,
            tone: "secondary",
            layerLabel: "Announcement (event link)",
            style: {
              ...style,
              backgroundColor: "rgba(0,0,0,0)",
              borderWidth: "0px",
              borderRadius: "0px",
              paddingTop: "0px",
              paddingBottom: "0px",
              paddingLeft: "0px",
              paddingRight: "0px",
              whiteSpace: "nowrap",
              transitionProperty: "color",
              transitionDuration: "180ms",
              transitionTimingFunction: "ease",
              hover: { color: "token:color.ink" },
            },
          },
        } as BuilderNode;
      }
      if (node.kind === "nav" && opts.dropLumina) {
        const props = node.props as { links?: Array<{ id: string; label: string; href: string }> };
        const links = props.links ?? [];
        const kept = links.filter((l) => !/lumina/i.test(l.label) && !/\/lumina$/.test(l.href));
        if (kept.length !== links.length) {
          changed.push("nav:lumina-removed");
          return { ...node, props: { ...node.props, links: kept } } as BuilderNode;
        }
        return node;
      }
      const children = (node as { children?: BuilderNode[] }).children;
      if (Array.isArray(children)) {
        const next = walk(children);
        if (next.some((c, i) => c !== children[i])) return { ...node, children: next } as BuilderNode;
      }
      return node;
    });
  return { tree: walk(live), changed };
}

async function main() {
  const { loadEnvLocal } = await import("../../load-env-local.mjs");
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const dropLumina = process.argv.includes("--drop-lumina");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("env missing");
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
  const { data: tenant } = await sb.from("agencies").select("id").eq("slug", process.env.IMPRONTA_SEED_TENANT_SLUG ?? "impronta").maybeSingle();
  if (!tenant) throw new Error("tenant not found");
  const tenantId = tenant.id as string;
  const { data: identity } = await sb.from("agency_business_identity").select("updated_by").eq("tenant_id", tenantId).maybeSingle();
  const actor = (identity?.updated_by as string | null) ?? null;

  for (const locale of ["en", "es"] as Locale[]) {
    const { data: row, error } = await sb
      .from("cms_pages")
      .select("id, version, status, blocks, template_schema_version, title, meta_description")
      .eq("tenant_id", tenantId).eq("locale", locale).eq("slug", "__site_shell__")
      .maybeSingle<{ id: string; version: number; status: string; blocks: BuilderNode[]; template_schema_version: number | null; title: string; meta_description: string | null }>();
    if (error || !row) throw new Error(`shell ${locale}: ${error?.message ?? "missing"}`);
    const r = patchShellAnnouncement(row.blocks ?? [], locale, { dropLumina });
    const v = validateBuilderNodeTree(r.tree);
    if (!v.ok) throw new Error(`${locale}: ${v.issues.map((i) => i.message).join("; ")}`);
    console.log(`${apply ? "APPLY" : "DRY"} shell/${locale}: ${r.changed.join(", ") || "no change"} (v${row.version})`);
    if (!apply || r.changed.length === 0) continue;
    const next = row.version + 1;
    const res = await commitPageRevisionThenVersion(sb, {
      tenantId, pageId: row.id, beforeVersion: row.version,
      update: { blocks: v.tree, version: next, updated_by: actor, edit_session_id: null, draft_seq: null },
      revision: {
        kind: "published", version: next, templateSchemaVersion: row.template_schema_version ?? 1,
        snapshot: { kind: "published", title: row.title, status: row.status, locale, meta_description: row.meta_description, version: next, published_at: new Date().toISOString(), composition: [], builderTree: v.tree },
      },
      actorProfileId: actor, logScope: "impronta-rebuild/announcement-patch",
    });
    if (!res.ok) throw new Error(`${locale}: ${res.reason}`);
    const pub = await republishSiteShellSnapshot(sb, { tenantId, locale, actorProfileId: actor });
    console.log(`  republish ${locale}: ok=${pub.ok}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
