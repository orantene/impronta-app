import { changelogFeedResponse } from "@/lib/changelog/feed";

export const dynamic = "force-dynamic";

export async function GET() {
  return changelogFeedResponse("es");
}
