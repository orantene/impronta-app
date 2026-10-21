import { PageRouteSyncer } from "../_page-route-syncer";
import { JoinTermsRedirectNotice } from "@/components/admin/service-hub/JoinTermsRedirectNotice";
import { parseJoinTermsFlag } from "@/lib/service-hub/join-terms";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminPage({ searchParams }: { searchParams: Search }) {
  // TUL-1476: after a direct add whose terms did not go out, show a short notice.
  const joinTerms = parseJoinTermsFlag((await searchParams).joinTerms);
  return (
    <>
      <PageRouteSyncer page="roster" />
      {joinTerms ? <JoinTermsRedirectNotice outcome={joinTerms} /> : null}
    </>
  );
}
