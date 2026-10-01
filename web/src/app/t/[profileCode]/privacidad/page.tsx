/** `/t/[profileCode]/privacidad`: see `_shared/policy-route.tsx`. */

import type { Metadata } from "next";

import { type PolicySearchParams, TalentProfilePolicyPage, talentProfilePolicyMetadata } from "../_shared/policy-route";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ profileCode: string }>; searchParams: PolicySearchParams }): Promise<Metadata> {
  const { profileCode } = await params;
  return talentProfilePolicyMetadata(profileCode, "privacy", searchParams);
}

export default async function Page({ params, searchParams }: { params: Promise<{ profileCode: string }>; searchParams: PolicySearchParams }) {
  const { profileCode } = await params;
  return <TalentProfilePolicyPage profileCode={profileCode} doc="privacy" searchParams={searchParams} />;
}
