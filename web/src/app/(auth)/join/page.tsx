import { permanentRedirect } from "next/navigation";

import { buildRegisterHref } from "@/lib/auth/register-intent";

/**
 * `/join` — talent-signup vanity URL.
 *
 * P2 investigation: `/join` is NOT a distinct invite-redemption flow. Token
 * redemption lives at `/invite/[token]` (route handler, sets the inviter
 * cookie) and profile claims at `/register?invitation=<id>` → `/claim`. `/join`
 * has only ever been a param-preserving alias that forwarded to
 * `/talent/register`, and `link-ref.ts` already classifies it as
 * `platform-auth-register` with role `talent`. So it stays as a vanity URL —
 * it is the CTA in seeded page designs ("Apply as talent", the Impronta noir
 * homepage and footer presets) and would be a wall of 404s if deleted — but it
 * now points straight at the canonical page instead of double-hopping through
 * another redirect.
 *
 * 308 (was 307) so the short URL keeps its link equity; every query param is
 * carried through unchanged.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  permanentRedirect(buildRegisterHref("talent", await searchParams));
}
