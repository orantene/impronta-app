import TalentNotFound from "../not-found";
import { isTalentSupportAlias } from "../_talent-support-alias";
import { TalentSupportEntry } from "./talent-support-entry";

// TUL-670: an unmatched /talent/* URL has no route, so Next fell through to the
// ROOT not-found (English, outside the dashboard shell, English tab title).
// This catch-all matches only what no real page matches.
//
// TUL-1241: it used to call the notFound helper from inside the talent layout. Inside the
// Suspense'd shell that swap crashed the client on production builds (React #310,
// Next's English "This page couldn't load"), the same failure TUL-635 fixed in the
// admin shell. The 404 card is now rendered INLINE (a normal render), localized by
// the dashboard locale, never via the notFound helper.
export default async function TalentMissingPage({
  params,
}: {
  params: Promise<{ missing?: string[] }>;
}) {
  const { missing } = await params;
  if (isTalentSupportAlias(missing ?? [])) return <TalentSupportEntry />;
  return <TalentNotFound />;
}
