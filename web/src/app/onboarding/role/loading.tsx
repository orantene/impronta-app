import { OnboardingStepSkeleton } from "@/components/onboarding/step-skeleton";

/** TUL-760: instant skeleton while /onboarding/role resolves the session on the server. */
export default function RoleLoading() {
  return <OnboardingStepSkeleton />;
}
