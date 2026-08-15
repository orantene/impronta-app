import type { NextRequest } from "next/server";

import { handleSocialOAuthCallback } from "@/lib/connection-oauth/social-callback-handler";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleSocialOAuthCallback(request, "instagram");
}
