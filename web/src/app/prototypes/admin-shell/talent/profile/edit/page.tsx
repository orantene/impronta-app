import { redirect } from "next/navigation";

/**
 * URL-route shim: /prototypes/admin-shell/talent/profile/edit
 *
 * The prototype is a single-page app rooted at /prototypes/admin-shell.
 * To make the talent edit-profile drawer URL-addressable (deep link from
 * an email, share link, bookmark, etc.) without splitting the app into
 * real per-route Next.js pages, this shim hands off to the prototype
 * with the right query params.
 *
 * The state hydration code in _state.tsx reads `?surface=...&drawer=...`
 * on mount and opens the drawer immediately. Resulting flow:
 *
 *   /prototypes/admin-shell/talent/profile/edit
 *     → 308 →
 *   /prototypes/admin-shell/?surface=talent&talentPage=profile&drawer=talent-profile-edit
 *
 * If we later split the prototype into real routes, this file is the
 * canonical entrypoint to keep stable.
 */
export default function TalentProfileEditRoute() {
  redirect(
    "/prototypes/admin-shell/?surface=talent&talentPage=profile&drawer=talent-profile-edit",
  );
}
