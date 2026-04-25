import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Palette } from "lucide-react";

import {
  SetupPage,
  SetupSection,
} from "@/components/admin/setup/setup-page";
import { hasPhase5Capability } from "@/lib/site-admin";
import { listThemePresets } from "@/lib/site-admin/presets/theme-presets";
import { loadDesignForStaff } from "@/lib/site-admin/server/design";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

import { ThemeKitsGrid, type ThemeKitView } from "./theme-kits-grid";

export const dynamic = "force-dynamic";

/**
 * /admin/site/setup/theme — premium kit gallery setup surface.
 *
 * Wraps the existing `applyThemePresetAction` in the Setup chrome so the
 * operator can pick a designer kit from a glanceable gallery. Picking lands
 * in draft (same semantics as the legacy `/admin/site-settings/design`
 * picker); a publish step happens on the legacy editor once the operator
 * wants the change to go live.
 */
export default async function SiteSetupThemePage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) redirect("/admin?err=no_tenant");

  const tenantId = scope.tenantId;

  const [canEdit, canPublish] = await Promise.all([
    hasPhase5Capability("agency.site_admin.design.edit", tenantId),
    hasPhase5Capability("agency.site_admin.design.publish", tenantId),
  ]);

  const branding = await loadDesignForStaff(auth.supabase, tenantId);

  const presets = listThemePresets();
  const activeSlug = branding?.theme_preset_slug ?? null;
  const version = branding?.version ?? 0;

  // Synthesize a glanceable visual per kit from its preview swatch. Each kit
  // gets a layered diagonal gradient that hints at its palette without
  // needing a hand-shot image.
  const kits: ThemeKitView[] = presets.map((preset) => {
    const sw = preset.previewSwatch;
    const visual = sw
      ? `linear-gradient(135deg, ${sw.background} 0%, ${sw.background} 38%, ${sw.secondary} 60%, ${sw.primary} 88%, ${sw.accent} 100%)`
      : "linear-gradient(135deg, #1a1a1d 0%, #2c2c30 100%)";
    return {
      slug: preset.slug,
      label: preset.label,
      summary: preset.summary,
      idealFor: [...preset.idealFor],
      visual,
    };
  });

  return (
    <SetupPage
      eyebrow="SETUP · STEP 5"
      title="Theme & foundations"
      icon={Palette}
      description={
        <>
          Apply a designer kit and your whole site — colors, typography,
          motion, density, layout — moves to it. You can still tweak any
          individual token below the gallery. Picking a kit lands in draft;
          publish happens on the legacy editor.
        </>
      }
      backHref="/admin/site/setup"
      backLabel="Back to Setup"
      headerExtras={
        <Link
          href="/admin/site-settings/design"
          className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(20,20,24,0.12)] bg-white px-2.5 py-1 text-[12px] font-semibold text-foreground/85 transition-colors hover:border-[rgba(20,20,24,0.24)] hover:text-foreground"
        >
          Open token editor
          <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      }
    >
      <SetupSection
        label="Designer kits"
        helper={
          activeSlug
            ? `Currently applied: ${activeSlug}`
            : "Pick a kit to seed every design token"
        }
      >
        {!canEdit && !canPublish ? (
          <div className="rounded-2xl border border-[rgba(20,20,24,0.10)] bg-white px-6 py-10 text-center">
            <p className="text-[13.5px] font-medium text-foreground">
              You don&rsquo;t have permission to apply a theme on this
              workspace.
            </p>
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Theme edits require the admin role.
            </p>
          </div>
        ) : (
          <ThemeKitsGrid
            kits={kits}
            activeSlug={activeSlug}
            version={version}
            canEdit={canEdit}
          />
        )}
      </SetupSection>

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/site-settings/design"
          className="group flex items-start justify-between gap-3 rounded-[12px] border border-[rgba(20,20,24,0.10)] bg-white px-4 py-3.5 transition-colors hover:border-[rgba(20,20,24,0.30)] hover:bg-[rgba(255,255,255,0.96)]"
        >
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-foreground">
              Fine-tune individual tokens
            </p>
            <p className="mt-0.5 text-[12px] leading-[1.45] text-muted-foreground">
              33 tokens — colors, type presets, radius, motion, density,
              shell — all editable.
            </p>
          </div>
          <ArrowUpRight
            className="size-4 shrink-0 text-muted-foreground/70 transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-foreground"
            aria-hidden
          />
        </Link>
        <Link
          href="/admin/site/setup"
          className="group flex items-start justify-between gap-3 rounded-[12px] border border-[rgba(20,20,24,0.10)] bg-white px-4 py-3.5 transition-colors hover:border-[rgba(20,20,24,0.30)] hover:bg-[rgba(255,255,255,0.96)]"
        >
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-foreground">
              Continue setup
            </p>
            <p className="mt-0.5 text-[12px] leading-[1.45] text-muted-foreground">
              Six-step site walkthrough. Theme is one of them — return to
              the hub for the rest.
            </p>
          </div>
          <ArrowUpRight
            className="size-4 shrink-0 text-muted-foreground/70 transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-foreground"
            aria-hidden
          />
        </Link>
      </div>
    </SetupPage>
  );
}
