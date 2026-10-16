import "server-only";

import {
  loadClientBookings,
  loadClientInquiries,
  loadClientPayableTransactions,
  loadClientPitches,
  loadClientTransactions,
  loadClientTrustBillingState,
  loadWorkspaceRosterLite,
} from "../../_data-bridge";
import { loadClientShortlistsForUser } from "../../_data-bridge/discover";
import { loadClientUpcoming } from "../../_data-bridge/client-upcoming";
import { loadClientInquiryDetails } from "../../_data-bridge/client-inquiry-details";
import { loadClientInquiryMessages } from "../../_data-bridge/inquiry-thread-messages";
import { loadClientSubscription } from "@/lib/discover/client-subscription";
import {
  loadClientRatingSummary,
  loadClientReviews,
  loadReviewsAuthoredByUser,
} from "@/lib/reviews/load-reviews";
import { tenantReviewsEnabled } from "@/lib/reviews/reviews-entitlement";
import { loadUserPrefs } from "@/lib/server-actions/user-prefs";
import { readUserId, type EffectiveReadContext } from "@/lib/impersonation/effective-read";
import {
  DEFAULT_CLIENT_PAGE_BASE,
  resolveClientPageRead,
  trustedCtx,
  type ClientPageBaseDeps,
  type ClientPageRead,
} from "./client-page-read";

/**
 * TUL-255. One small loader per client-portal page. Every query is keyed on the
 * EFFECTIVE user (`read.userId`), and every RLS-bound read gets the admin client
 * only for a verified impersonation (`read.readClient`). Outside an
 * impersonation each call is exactly the one the page made before.
 * `ctx` comes only from `effectiveReadContext` in the page.
 */
export type ClientPageDeps = ClientPageBaseDeps & {
  subscription: typeof loadClientSubscription;
  shortlists: typeof loadClientShortlistsForUser;
  pitches: typeof loadClientPitches;
  inquiries: typeof loadClientInquiries;
  bookings: typeof loadClientBookings;
  transactions: typeof loadClientTransactions;
  payable: typeof loadClientPayableTransactions;
  upcoming: typeof loadClientUpcoming;
  roster: typeof loadWorkspaceRosterLite;
  trust: typeof loadClientTrustBillingState;
  reviews: typeof loadClientReviews;
  ratingSummary: typeof loadClientRatingSummary;
  authored: typeof loadReviewsAuthoredByUser;
  prefs: typeof loadUserPrefs;
  messages: typeof loadClientInquiryMessages;
  details: typeof loadClientInquiryDetails;
  reviewsEnabled: (tenantId: string) => Promise<boolean>;
};

export const DEFAULT_CLIENT_PAGE_DEPS: ClientPageDeps = {
  ...DEFAULT_CLIENT_PAGE_BASE,
  subscription: loadClientSubscription,
  shortlists: loadClientShortlistsForUser,
  pitches: loadClientPitches,
  inquiries: loadClientInquiries,
  bookings: loadClientBookings,
  transactions: loadClientTransactions,
  payable: loadClientPayableTransactions,
  upcoming: loadClientUpcoming,
  roster: loadWorkspaceRosterLite,
  trust: loadClientTrustBillingState,
  reviews: loadClientReviews,
  ratingSummary: loadClientRatingSummary,
  authored: loadReviewsAuthoredByUser,
  prefs: loadUserPrefs,
  messages: loadClientInquiryMessages,
  details: loadClientInquiryDetails,
  reviewsEnabled: tenantReviewsEnabled,
};

type Ctx = EffectiveReadContext | undefined;

/** Discover: the profile gate plus the viewer's plan. */
export async function loadDiscoverPageData(
  sessionUserId: string,
  tenantId: string,
  ctx: Ctx,
  deps: ClientPageDeps = DEFAULT_CLIENT_PAGE_DEPS,
) {
  const read = await resolveClientPageRead(sessionUserId, tenantId, ctx, deps);
  if (!read) return null;
  return { read, subscription: await deps.subscription(read.userId) };
}

/** Shortlists: profile gate, the viewer's shortlists and plan. */
export async function loadShortlistsPageData(
  sessionUserId: string,
  tenantId: string,
  ctx: Ctx,
  deps: ClientPageDeps = DEFAULT_CLIENT_PAGE_DEPS,
) {
  const read = await resolveClientPageRead(sessionUserId, tenantId, ctx, deps);
  if (!read) return null;
  const [shortlists, subscription] = await Promise.all([
    deps.shortlists(read.userId),
    deps.subscription(read.userId),
  ]);
  return { read, shortlists, subscription };
}

/** Subscription: no profile gate (as before), just the effective user's plan. */
export async function loadSubscriptionPageData(
  sessionUserId: string,
  ctx: Ctx,
  deps: ClientPageDeps = DEFAULT_CLIENT_PAGE_DEPS,
) {
  return deps.subscription(readUserId(sessionUserId, trustedCtx(sessionUserId, ctx)));
}

/** Pitches: profile gate and the pitches addressed to the effective user. */
export async function loadPitchesPageData(
  sessionUserId: string,
  tenantId: string,
  ctx: Ctx,
  deps: ClientPageDeps = DEFAULT_CLIENT_PAGE_DEPS,
) {
  const read = await resolveClientPageRead(sessionUserId, tenantId, ctx, deps);
  if (!read) return null;
  return { read, pitches: await deps.pitches(read.userId) };
}

/** Reviews: profile gate, then (if the workspace has reviews on) both directions. */
export async function loadReviewsPageData(
  sessionUserId: string,
  tenantId: string,
  ctx: Ctx,
  deps: ClientPageDeps = DEFAULT_CLIENT_PAGE_DEPS,
) {
  const read = await resolveClientPageRead(sessionUserId, tenantId, ctx, deps);
  if (!read) return null;
  if (!(await deps.reviewsEnabled(tenantId))) return { read, enabled: false as const };
  const [received, receivedSummary, authored, roster] = await Promise.all([
    deps.reviews(read.userId, undefined, read.readClient),
    deps.ratingSummary(read.userId, read.readClient),
    deps.authored(read.userId, undefined, read.readClient),
    deps.roster(tenantId),
  ]);
  return { read, enabled: true as const, received, receivedSummary, authored, roster };
}

/** Inquiries list. */
export async function loadInquiriesPageData(
  sessionUserId: string,
  tenantId: string,
  ctx: Ctx,
  deps: ClientPageDeps = DEFAULT_CLIENT_PAGE_DEPS,
) {
  const read = await resolveClientPageRead(sessionUserId, tenantId, ctx, deps);
  if (!read) return null;
  const [inquiries, roster] = await Promise.all([
    deps.inquiries(read.userId, tenantId, read.readClient),
    deps.roster(tenantId),
  ]);
  return { read, inquiries, roster };
}

/** Bookings list plus the payments scoped to this client's own booking ids. */
export async function loadBookingsPageData(
  sessionUserId: string,
  tenantId: string,
  ctx: Ctx,
  deps: ClientPageDeps = DEFAULT_CLIENT_PAGE_DEPS,
) {
  const read = await resolveClientPageRead(sessionUserId, tenantId, ctx, deps);
  if (!read) return null;
  const [bookings, roster] = await Promise.all([
    deps.bookings(read.userId, tenantId, read.readClient),
    deps.roster(tenantId),
  ]);
  const agencyBookingIds = bookings
    .map((b) => b.agencyBookingId)
    .filter((x): x is string => !!x);
  const [transactions, payable] = await Promise.all([
    deps.transactions(read.userId, agencyBookingIds),
    deps.payable(read.userId, agencyBookingIds),
  ]);
  return { read, bookings, roster, transactions, payable };
}

/** Today: inquiries, upcoming and bookings of the effective user. */
export async function loadTodayPageData(
  sessionUserId: string,
  tenantId: string,
  ctx: Ctx,
  deps: ClientPageDeps = DEFAULT_CLIENT_PAGE_DEPS,
) {
  const read = await resolveClientPageRead(sessionUserId, tenantId, ctx, deps);
  if (!read) return null;
  const [inquiries, roster, upcoming, bookings] = await Promise.all([
    deps.inquiries(read.userId, tenantId, read.readClient),
    deps.roster(tenantId),
    deps.upcoming(read.userId, tenantId, read.readClient),
    deps.bookings(read.userId, tenantId, read.readClient),
  ]);
  return { read, inquiries, roster, upcoming, bookings };
}

/**
 * Messages: the inquiry list plus the pinned/first thread preloaded. The
 * re-home tenant lookup goes through the same client the list used.
 */
export async function loadMessagesPageData(
  sessionUserId: string,
  tenantId: string,
  ctx: Ctx,
  pinnedInquiry: string | undefined,
  deps: ClientPageDeps = DEFAULT_CLIENT_PAGE_DEPS,
  rehomeEnabled: boolean = process.env.XTENANT_REHOME === "1",
) {
  const read = await resolveClientPageRead(sessionUserId, tenantId, ctx, deps);
  if (!read) return null;
  const [inquiries, roster] = await Promise.all([
    deps.inquiries(read.userId, tenantId, read.readClient),
    deps.roster(tenantId),
  ]);
  // A pinned id outside the loaded set must never fall back to another thread.
  const pinnedMatch = pinnedInquiry
    ? inquiries.find((i) => i.id === pinnedInquiry)?.id ?? null
    : null;
  const pinnedNotFound = Boolean(pinnedInquiry) && pinnedMatch === null;
  const initialActiveId = pinnedInquiry ? pinnedMatch : inquiries[0]?.id ?? null;

  let activeTenantId = tenantId;
  if (initialActiveId && rehomeEnabled) {
    const supabase = read.readClient ?? (await deps.rlsClient());
    const { data: activeRow } = supabase
      ? await supabase
          .from("inquiries")
          .select("tenant_id")
          .eq("id", initialActiveId)
          .eq("client_user_id", read.userId)
          .maybeSingle()
      : { data: null };
    if (activeRow?.tenant_id) activeTenantId = activeRow.tenant_id as string;
  }

  const [initialMessages, initialDetails] = await Promise.all([
    initialActiveId
      ? deps.messages(activeTenantId, initialActiveId, read.impersonated ? read.userId : undefined)
      : Promise.resolve([]),
    initialActiveId
      ? deps.details(activeTenantId, initialActiveId, read.readClient)
      : Promise.resolve(null),
  ]);
  return { read, inquiries, roster, initialActiveId, pinnedNotFound, initialMessages, initialDetails };
}

/**
 * Settings: profile, trust standing and reviews of the effective user. The
 * notification prefs reader is a server action bound to the session user, so it
 * is skipped while impersonating (the page also hides every write card then).
 */
export async function loadSettingsPageData(
  sessionUserId: string,
  tenantId: string,
  ctx: Ctx,
  deps: ClientPageDeps = DEFAULT_CLIENT_PAGE_DEPS,
) {
  const read = await resolveClientPageRead(sessionUserId, tenantId, ctx, deps);
  if (!read) return null;
  const [trustState, userPrefs, receivedReviews, receivedSummary, authoredReviews] =
    await Promise.all([
      deps.trust(read.userId, tenantId, read.ctx),
      read.impersonated ? Promise.resolve(null) : deps.prefs(read.userId),
      deps.reviews(read.userId, undefined, read.readClient),
      deps.ratingSummary(read.userId, read.readClient),
      deps.authored(read.userId, undefined, read.readClient),
    ]);
  return { read, trustState, userPrefs, receivedReviews, receivedSummary, authoredReviews };
}

export type { ClientPageRead };
