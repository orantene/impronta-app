/**
 * The pay page's theme follows the order's MERCHANT, not the host the link was opened on. On the
 * platform hub a single-talent order is that talent's own sale (TUL-437), so the return view
 * wears her published site tokens instead of the hub's. Any other order keeps the host theme
 * (null). Presentation only; best effort, never throws.
 */
import { readTalentDesignSlice } from "@/lib/site-admin/edit-mode/talent-design-store";
import { designTokensToCssVars } from "@/lib/site-admin/tokens/resolve";
import { resolveOrderSoleTalentId } from "@/lib/payments/payee-name";

type Admin = Parameters<typeof resolveOrderSoleTalentId>[0];

export async function resolvePayThemeVars(admin: Admin, tenantId: string, orderId: string): Promise<Record<string, string> | null> {
  const talentId = await resolveOrderSoleTalentId(admin, tenantId, orderId);
  if (!talentId) return null;
  try {
    // supabase-read-unchecked-ok: theme tokens only; a failed read keeps the host theme.
    const { data } = await admin
      .from("talent_pages")
      .select("slug, theme")
      .eq("talent_profile_id", talentId)
      .eq("status", "published")
      .order("slug");
    const pages = (data ?? []) as Array<{ slug: string; theme: unknown }>;
    const withTokens = pages
      .map((p) => ({ slug: p.slug, tokens: readTalentDesignSlice(p.theme).tokens }))
      .filter((p) => Object.keys(p.tokens).length > 0);
    const chosen = withTokens.find((p) => p.slug === "home") ?? withTokens[0];
    if (!chosen) return null;
    const vars = designTokensToCssVars(chosen.tokens);
    const heading = chosen.tokens["typography.heading-font-family"]?.trim();
    const body = chosen.tokens["typography.body-font-family"]?.trim();
    if (heading) vars["--site-heading-font"] = heading;
    if (body) vars["--site-body-font"] = body;
    return Object.keys(vars).length > 0 ? vars : null;
  } catch {
    return null;
  }
}
