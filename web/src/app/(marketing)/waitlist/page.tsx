import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * `/waitlist` is the legacy entry point referenced by older analytics
 * events and header `Sign in` links. The product is now free-to-start,
 * so the waitlist is closed and both intents funnel through
 * `/get-started`. Redirects preserve any `?intent=signin` parameter so
 * the registration page can render an appropriate message.
 */
export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const resolved = await searchParams;
  const intent = resolved.intent ?? "";
  const suffix = intent ? `?intent=${encodeURIComponent(intent)}` : "";
  redirect(`/get-started${suffix}`);
}
