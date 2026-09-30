/** `/t/[profileCode]/politicas`: see `_shared/policy-route.tsx`. */

import type { Metadata } from "next";

import { TalentProfilePolicyPage, talentProfilePolicyMetadata } from "../_shared/policy-route";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ profileCode: string }> }): Promise<Metadata> {
  const { profileCode } = await params;
  return talentProfilePolicyMetadata(profileCode, "booking");
}

export default async function Page({ params }: { params: Promise<{ profileCode: string }> }) {
  const { profileCode } = await params;
  return <TalentProfilePolicyPage profileCode={profileCode} doc="booking" />;
}
