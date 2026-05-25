import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicHeader } from "@/components/public-header";
import { TalentPersonalSiteRenderer } from "@/components/talent/site/TalentPersonalSiteRenderer";
import { TalentSiteNotPublished } from "@/components/talent/site/TalentSiteNotPublished";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentPublicSiteByProfileCode, loadTalentPublicSiteDraftForOwner } from "@/lib/talent-site/server/public-load";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageParams = Promise<{ profileCode: string }>;
type PageSearchParams = Promise<{ preview?: string }>;

export async function generateMetadata({
  params,
}: {
  params: PageParams;
}): Promise<Metadata> {
  const { profileCode } = await params;
  const loaded = await loadTalentPublicSiteByProfileCode(profileCode);
  if (loaded.kind === "published") {
    return {
      title: loaded.snapshot.fields.title,
      description: loaded.snapshot.fields.metaDescription ?? undefined,
    };
  }
  if (loaded.kind === "not_published") {
    return {
      title: "Personal site not published",
      robots: { index: false, follow: true },
    };
  }
  return { title: "Not found" };
}

export default async function TalentPersonalSitePage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearchParams;
}) {
  const { profileCode } = await params;
  const { preview } = await searchParams;

  const loaded = await loadTalentPublicSiteByProfileCode(profileCode);

  if (loaded.kind === "not_found") {
    notFound();
  }

  let snapshot = loaded.kind === "published" ? loaded.snapshot : null;

  if (preview === "draft") {
    const session = await getCachedActorSession();
    if (session.user) {
      const draft = await loadTalentPublicSiteDraftForOwner(profileCode, session.user.id);
      if (draft) snapshot = draft;
    }
  }

  return (
    <div data-talent-personal-site-shell="">
      <PublicHeader />
      <main>
        {snapshot ? (
          <TalentPersonalSiteRenderer snapshot={snapshot} />
        ) : loaded.kind === "not_published" ? (
          <TalentSiteNotPublished profileCode={loaded.profileCode} />
        ) : (
          <TalentSiteNotPublished profileCode={profileCode} />
        )}
      </main>
      <footer
        style={{
          borderTop: "1px solid rgba(24,24,27,0.08)",
          padding: "24px 16px",
          textAlign: "center",
          fontSize: 12,
          color: "rgba(11,11,13,0.45)",
          fontFamily: '"Inter", system-ui, sans-serif',
        }}
      >
        <Link href={`/t/${encodeURIComponent(profileCode)}`} style={{ color: "inherit" }}>
          View standard profile
        </Link>
        {" · "}
        <Link href="/" style={{ color: "inherit" }}>
          Tulala
        </Link>
      </footer>
    </div>
  );
}
