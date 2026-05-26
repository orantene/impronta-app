import { GetStartedForm } from "./get-started-form";

export type HomepageClaimSignedIn = {
  userId: string;
  email: string;
  displayName: string | null;
};

/**
 * Compact workspace-claim card for the marketing homepage hero.
 */
export function HomepageClaimCard({
  signedIn,
}: {
  signedIn?: HomepageClaimSignedIn | null;
}) {
  return (
    <GetStartedForm
      variant="compact"
      tier="free"
      initialAudience="operator"
      initialSignedIn={signedIn ?? undefined}
      sourcePage="/"
    />
  );
}
