/**
 * BUILDER 2027 · P2B — visitor-scoped resolution for the two SESSION-dependent
 * native header widgets (`dataSources.headerWidgets`).
 *
 * WHY THE SHELL RESOLVES THIS AND THE RENDERER DOES NOT
 * ────────────────────────────────────────────────────
 * `builder-node/render.tsx` is imported by the CLIENT edit-chrome bundle. If it
 * read the session directly it would pull auth and Supabase into that bundle,
 * which is the same reason `renderSectionEmbed` is injected rather than
 * imported. So the shell resolves the visitor's state once and hands the
 * renderer plain data, exactly as `HeaderAuthArea` resolves it for the legacy
 * header bar.
 *
 * HOST SAFETY IS NOT OPTIONAL HERE
 * ────────────────────────────────
 * `/admin`, `/talent`, `/client` and `/onboarding/role` do NOT exist on a
 * tenant storefront host. A relative account href is therefore a 404 on every
 * agency domain, which is precisely the failure `hostSafeDestination` exists to
 * prevent — so every href this module returns goes through it before it leaves.
 * An absolute app-host URL then passes through the renderer's
 * `prefixPublicHref` untouched (it matches `EXTERNAL_OR_SPECIAL_HREF`), and
 * `/login` is a platform auth path that the prefixer also leaves alone.
 *
 * FAILURE MODE
 * ────────────
 * Every read is wrapped: a failure returns `undefined` for that widget, and the
 * renderer then paints its own signed-out affordance, which is a REAL link to
 * `/login`, never a dead chip.
 */
import "server-only";

import type { AccessProfileWithDisplayName } from "@/lib/access-profile";
import {
  isOnboardingStatus,
  resolveAccountHref,
} from "@/lib/auth-flow";
import { getSavedTalentIds } from "@/lib/public-discovery";
import { hostSafeDestination } from "@/lib/saas/host-safe-destination";
import { getPublicHostContext } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

/** The exact shape `BuilderNodeRenderDataSources.headerWidgets` declares. */
export type NativeHeaderWidgetsData = {
  account?: {
    signedIn?: boolean;
    href?: string;
    displayName?: string;
  };
  inquiry?: {
    count?: number;
    href?: string;
  };
};

/**
 * PURE derivation of the account chip from an already-resolved session.
 *
 * Split from the read so the two rules that have actually broken in production
 * are directly testable without a request: (1) a signed-out visitor gets
 * `/login` and never a dashboard path, and (2) a visitor mid-onboarding is NOT
 * shown a dashboard link they cannot use yet.
 *
 * `makeHostSafe` is injected rather than imported so a test can assert the
 * transform is applied at all, which is the part that silently regressed
 * before: the href was correct in isolation and a 404 on every agency host.
 */
export function deriveNativeAccountWidget(params: {
  signedIn: boolean;
  profile: AccessProfileWithDisplayName | null;
  makeHostSafe: (href: string) => string;
}): NonNullable<NativeHeaderWidgetsData["account"]> {
  const { signedIn, profile, makeHostSafe } = params;
  const link = resolveAccountHref(signedIn, profile ?? null);
  // A half-onboarded account's destination is the onboarding step itself, which
  // `resolveAccountHref` already returns; naming the visitor there would read
  // as "you have an account" when they cannot yet use one, so the chip stays
  // unnamed until onboarding is finished.
  const named =
    signedIn && !isOnboardingStatus(profile?.account_status)
      ? profile?.display_name?.trim()
      : undefined;
  return {
    signedIn,
    href: makeHostSafe(link.href),
    ...(named ? { displayName: named } : {}),
  };
}

/**
 * Resolve the visitor-scoped header widget data for THIS request.
 *
 * `need` mirrors `collectNativeDataBlockNeeds(...).headerWidgets`: a widget the
 * tree does not contain costs no round-trip at all.
 */
export async function resolveNativeHeaderWidgets(need: {
  account: boolean;
  inquiry: boolean;
}): Promise<NativeHeaderWidgetsData | undefined> {
  if (!need.account && !need.inquiry) return undefined;

  const out: NativeHeaderWidgetsData = {};

  if (need.account) {
    try {
      const [actor, hostContext] = await Promise.all([
        getCachedActorSession(),
        getPublicHostContext(),
      ]);
      out.account = deriveNativeAccountWidget({
        signedIn: Boolean(actor.user),
        profile: actor.profile,
        makeHostSafe: (href) => hostSafeDestination(href, hostContext.kind),
      });
    } catch (error) {
      logServerError("native-header-widgets/account", error);
    }
  }

  if (need.inquiry) {
    try {
      const savedIds = await getSavedTalentIds();
      out.inquiry = {
        count: savedIds.length,
        // The live widget is a DRAWER with no URL of its own, so the fallback
        // link needs a real page to lead to. `/directory` is where a visitor
        // can see and act on the people they saved. The renderer's own default
        // was `/inquiry`, which is not a route on any host — a chip that 404s
        // is worse than one that leads somewhere useful.
        href: "/directory",
      };
    } catch (error) {
      logServerError("native-header-widgets/inquiry", error);
    }
  }

  return out.account || out.inquiry ? out : undefined;
}
