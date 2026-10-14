import { OnboardingStepSkeleton } from "@/components/onboarding/step-skeleton";

/** TUL-760: instant skeleton while /start resolves flags and locale on the server. */
export default function StartLoading() {
  return <OnboardingStepSkeleton />;
}
