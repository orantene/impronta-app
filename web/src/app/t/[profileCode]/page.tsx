// ---------------------------------------------------------------------------
// /t/[profileCode] — canonical public talent profile route.
//
// Thin wrapper: the entire render lives in profile-view.tsx
// (TalentProfileView), shared with the directory quick-open modal at
// src/app/@modal/(.)t/[profileCode]. Keep this file to route plumbing only —
// segment config, metadata delegation, param resolution.
// ---------------------------------------------------------------------------

import type { Metadata } from "next";

import {
  TalentProfileView,
  buildTalentProfileMetadata,
  type TalentProfileSearchParams,
} from "./profile-view";

// Route segment config — a public talent profile MUST reflect the agency's
// latest edits. Without this, Next's Data Cache memoises the supabase-js
// fetches (and persists across Vercel deploys), so newly-public fields
// (e.g. physical casting attributes after show_in_public was flipped) never
// appear. force-no-store makes every fetch in this route read fresh.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export async function generateMetadata(props: {
  params: Promise<{ profileCode: string }>;
  searchParams: Promise<{ preview?: string }>;
}): Promise<Metadata> {
  return buildTalentProfileMetadata(props);
}

export default async function PublicTalentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ profileCode: string }>;
  searchParams: Promise<TalentProfileSearchParams>;
}) {
  const { profileCode } = await params;
  const sp = await searchParams;
  return <TalentProfileView profileCode={profileCode} sp={sp} variant="page" />;
}
