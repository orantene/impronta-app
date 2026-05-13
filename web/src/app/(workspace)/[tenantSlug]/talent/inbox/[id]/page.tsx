import { PinThenRedirect } from "./_pin-then-redirect";

// C8 — Talent thread deep-link.
//
// Old behavior: redirect to /talent/inbox, losing the id entirely.
// New behavior: pin the id into the talent shell's pending-conversation
// slot, then redirect — the shell opens directly to the threaded view
// on mount.
//
// The actual conversation rendering lives inside the prototype-style
// talent shell (a single PageRouter that swaps panes by state). URL-as-
// state is Phase X work; this bridge gives us deep-link parity without
// rebuilding the shell.

type PageParams = Promise<{ tenantSlug: string; id: string }>;

export default async function TalentInquiryThreadDeepLink({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug, id } = await params;
  return <PinThenRedirect conversationId={id} tenantSlug={tenantSlug} />;
}
