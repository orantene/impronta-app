import { TalentPageRouteSyncer } from "../_talent-page-route-syncer";

export const dynamic = "force-dynamic";

// Posts v1 (TUL-1007): Website -> Posts. The list renders inside the talent
// shell (the "posts" page of the SPA router); the writer is a bare full-screen
// route at /talent/posts/[id].
export default function PlatformTalentPostsPage() {
  return <TalentPageRouteSyncer page="posts" />;
}
