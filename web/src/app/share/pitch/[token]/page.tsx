/**
 * Public pitch landing page — /share/pitch/[token]
 *
 * Token-gated, no-auth page. The JWT carries tenantId + pitchId +
 * shareTokenId. The engine verifies the token and checks the DB-side
 * revocation flag (share_token_id round-trip), so there is no separate
 * host→tenant cross-check here: pitch links land on tulala.digital
 * which is a shared hub domain, not a per-tenant host.
 *
 * Service-role client used because:
 *   - The visitor is unauthenticated — RLS blocks anon reads.
 *   - loadPitchByToken enforces tenant isolation via the JWT claims.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadPitchByToken } from "@/lib/pitch/pitch-engine";
import type { PitchRow } from "@/lib/pitch/pitch-types";
import { sanitizeBrandMarkSvg } from "@/lib/site-admin/sanitize-svg";
import { resolveCardDesign } from "@/lib/site-admin/server/card-design-resolver";
import type { CardDesign } from "@/lib/site-admin/server/card-design-shape";
import { loadPublicBranding } from "@/lib/site-admin/server/reads";
import {
  designTokensToCssVars,
  designTokensToDataAttrs,
  resolveDesignTokens,
} from "@/lib/site-admin/tokens/resolve";
import { getCachedActorSession } from "@/lib/server/request-cache";

import { PitchLanding } from "./_pitch-landing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Talent pitch",
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export type PitchTalentCard = {
  pitchTalentId: string;
  talentProfileId: string;
  displayName: string;
  shortBio: string | null;
  heightCm: number | null;
  photoUrl: string | null;
  adminNote: string | null;
  /** Server-resolved initial removed state; used to hydrate client removed-set. */
  _removedAt: string | null;
};

export type PitchLandingData = {
  token: string;
  pitch: PitchRow;
  talents: PitchTalentCard[];
  agencyName: string;
  brandMarkSvg: string | null;
  /**
   * Step 8 — whether the viewer is signed in. Drives the identity opt-in
   * surface on the inquiry-submission CTA: signed-in users skip the
   * guest-or-register prompt; anonymous viewers see both options.
   */
  viewerSignedIn: boolean;
  /**
   * The pitching tenant's published Card Design. Pitch links land on the
   * shared hub domain, so the <html> token cascade carries platform defaults —
   * the landing resolves the design explicitly (like the marketing directory)
   * so pitch tiles paint in the SAME palette + family as every other card
   * surface. One design, every surface.
   */
  cardDesign: CardDesign;
  /**
   * The tenant's FULL resolved design-token CSS vars (what the storefront
   * <html> carries). Family CSS reads theme vars (--token-color-*, with
   * !important); the hub domain doesn't have them, so without this the
   * family background collapses to transparent under a dark design.
   */
  designTokenVars: Record<string, string>;
  /** data-token-* attrs (background-mode etc.) — the var-defining CSS blocks
   *  match :is(html, [data-card-design-scope]) so the wrapper can carry them. */
  designTokenAttrs: Record<string, string>;
  /** Path the registration CTA should navigate back to (?next=). */
  registerNextPath: string;
};

export default async function PitchTokenPage({ params }: PageProps) {
  const { token } = await params;

  const admin = createServiceRoleClient();
  if (!admin) {
    return <PitchError reason="config" />;
  }

  const loaded = await loadPitchByToken(admin, token);

  if (!loaded.ok) {
    return <PitchError reason={loaded.reason} />;
  }

  const pitch = loaded.data;

  // Load talent rows — include active and client-removed so the landing
  // can show removed state client-side after a page reload.
  const { data: pitchTalentRows } = await admin
    .from("pitch_talents")
    .select("id, talent_profile_id, position, admin_note, removed_by_client_at")
    .eq("pitch_id", pitch.id)
    .eq("tenant_id", pitch.tenant_id)
    .order("position", { ascending: true });

  const talentRows = (pitchTalentRows ?? []) as Array<{
    id: string;
    talent_profile_id: string;
    position: number;
    admin_note: string | null;
    removed_by_client_at: string | null;
  }>;

  const talentProfileIds = talentRows.map((r) => r.talent_profile_id);

  // Load profile data in one query.
  const { data: profileRows } = talentProfileIds.length
    ? await admin
        .from("talent_profiles")
        .select("id, display_name, first_name, last_name, short_bio, height_cm")
        .in("id", talentProfileIds)
    : { data: [] };

  const profileMap = new Map(
    ((profileRows ?? []) as Array<{
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      short_bio: string | null;
      height_cm: number | null;
    }>).map((p) => [p.id, p]),
  );

  // Load card-variant photo for each talent.
  const { data: mediaRows } = talentProfileIds.length
    ? await admin
        .from("media_assets")
        .select("owner_talent_profile_id, bucket_id, storage_path")
        .in("owner_talent_profile_id", talentProfileIds)
        .eq("variant_kind", "card")
        .is("deleted_at", null)
    : { data: [] };

  const photoMap = new Map(
    ((mediaRows ?? []) as Array<{
      owner_talent_profile_id: string;
      bucket_id: string;
      storage_path: string;
    }>).map((m) => [
      m.owner_talent_profile_id,
      admin.storage.from(m.bucket_id).getPublicUrl(m.storage_path).data.publicUrl,
    ]),
  );

  const talents: PitchTalentCard[] = talentRows.map((r) => {
    const p = profileMap.get(r.talent_profile_id);
    const displayName =
      p?.display_name?.trim() ||
      [p?.first_name, p?.last_name].filter(Boolean).join(" ") ||
      "Talent";
    return {
      pitchTalentId: r.id,
      talentProfileId: r.talent_profile_id,
      displayName,
      shortBio: p?.short_bio ?? null,
      heightCm: p?.height_cm ?? null,
      photoUrl: photoMap.get(r.talent_profile_id) ?? null,
      adminNote: r.admin_note,
      _removedAt: r.removed_by_client_at,
    };
  });

  // Agency name + optional brand mark SVG.
  const { data: agencyRow } = await admin
    .from("agencies")
    .select("display_name")
    .eq("id", pitch.tenant_id)
    .maybeSingle();
  const agencyName =
    (agencyRow as { display_name?: string } | null)?.display_name?.trim() ||
    "your agency";

  const { data: brandingRow } = await admin
    .from("agency_business_identity")
    .select("brand_mark_svg, public_name")
    .eq("tenant_id", pitch.tenant_id)
    .maybeSingle();
  const brandMarkRaw =
    (brandingRow as { brand_mark_svg?: string | null } | null)?.brand_mark_svg ??
    null;
  // Sanitize before sending to the client. Mirrors public-header.tsx —
  // even though the column should be sanitized at save, render-side sanitize
  // is cheap and guarantees no arbitrary markup ships if the column got
  // populated out-of-band (seed script, direct SQL).
  const brandMarkSvg = brandMarkRaw
    ? (sanitizeBrandMarkSvg(brandMarkRaw).svg ?? null)
    : null;
  const publicName =
    (brandingRow as { public_name?: string | null } | null)?.public_name?.trim() ||
    agencyName;

  // Step 8 — detect viewer auth so the landing can offer the right
  // identity opt-in (guest vs. register vs. nothing). We never redirect
  // or gate access on auth; the pitch is always reachable via the token.
  const viewerSession = await getCachedActorSession();
  const viewerSignedIn = !!viewerSession.user;

  // The pitching tenant's published Card Design (cached, tag-busted on
  // publish) — pitch tiles paint in the tenant's palette + family.
  const cardDesign = await resolveCardDesign(pitch.tenant_id);
  const publicBranding = await loadPublicBranding(pitch.tenant_id);
  const resolvedTokens = resolveDesignTokens(publicBranding);
  const designTokenVars = designTokensToCssVars(resolvedTokens);
  const designTokenAttrs = designTokensToDataAttrs(resolvedTokens);
  const registerNextPath = `/share/pitch/${encodeURIComponent(token)}`;

  const landingData: PitchLandingData = {
    token,
    cardDesign,
    designTokenVars,
    designTokenAttrs,
    pitch,
    talents,
    agencyName: publicName,
    brandMarkSvg,
    viewerSignedIn,
    registerNextPath,
  };

  return <PitchLanding data={landingData} />;
}

// ── Error states ────────────────────────────────────────────────────────────

function PitchError({ reason }: { reason: string }) {
  type Copy = { title: string; body: string };
  const copy: Copy = (() => {
    switch (reason) {
      case "token_expired":
      case "expired":
        return {
          title: "This pitch has expired.",
          body: "The link is no longer active. Contact the agency for updated availability.",
        };
      case "token_revoked":
      case "cancelled":
        return {
          title: "This pitch has been cancelled.",
          body: "The agency has withdrawn this pitch. Reach out to them directly if you're still interested.",
        };
      case "token_invalid":
        return {
          title: "This link isn't valid.",
          body: "It may have been mistyped or tampered with. Check the original message.",
        };
      case "pitch_not_found":
        return {
          title: "Pitch not found.",
          body: "This pitch may have been removed. Contact the agency directly.",
        };
      case "config":
        return {
          title: "Something went wrong.",
          body: "We couldn't load this pitch. Try again in a moment.",
        };
      default:
        return {
          title: "Something went wrong.",
          body: "We couldn't open this pitch. Try again, or ask the sender for a fresh link.",
        };
    }
  })();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white px-8 py-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-zinc-500"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="text-base font-semibold text-zinc-900">{copy.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">{copy.body}</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 transition hover:border-zinc-400"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
