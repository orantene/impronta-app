// Phase 3 — canonical workspace Bookings page.
// Server Component — no "use client".
//
// Shows confirmed bookings (status = 'booked' | 'converted') for the tenant
// identified by `tenantSlug`. Ordered by event_date ascending so the next
// upcoming job is first.
// Data via `loadWorkspaceBookings()` — explicit tenantId, no mock data.
// Capability gate: view_dashboard (viewer+).

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadWorkspaceBookings } from "../../_data-bridge";
import {
  ADMIN_PAGE_STACK,
  ADMIN_TEXT_DISPLAY_LG,
  ADMIN_TEXT_EYEBROW,
  ADMIN_HOME_SECTION_GAP,
} from "@/lib/dashboard-shell-classes";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isUpcoming(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso) >= new Date();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceBookingsPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("view_dashboard", scope.tenantId);
  if (!canView) notFound();

  const bookings = await loadWorkspaceBookings(scope.tenantId);

  const upcoming = bookings.filter((b) => isUpcoming(b.event_date));
  const past = bookings.filter((b) => !isUpcoming(b.event_date));

  return (
    <div className={ADMIN_PAGE_STACK}>
      <div className={ADMIN_HOME_SECTION_GAP}>
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className={ADMIN_TEXT_EYEBROW}>{scope.membership.display_name}</p>
            <h1 className={ADMIN_TEXT_DISPLAY_LG}>
              Bookings
              <span className="ml-2 text-[var(--admin-nav-idle)] text-base font-normal">
                {bookings.length}
              </span>
            </h1>
          </div>
          <Link
            href="/admin/inquiries"
            className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-bg)] px-3.5 py-1.5 text-sm font-medium text-[var(--admin-workspace-fg)] hover:bg-[var(--admin-nav-idle)]/10 transition-colors"
          >
            Full pipeline
          </Link>
        </div>

        {bookings.length === 0 ? (
          <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] px-6 py-12 text-center">
            <p className="text-sm text-[var(--admin-nav-idle)]">
              No confirmed bookings yet.
            </p>
            <p className="mt-1 text-xs text-[var(--admin-nav-idle)]/70">
              Bookings appear here once an inquiry is confirmed.
            </p>
          </div>
        ) : (
          <>
            {/* Upcoming */}
            {upcoming.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-[var(--admin-workspace-fg)] mb-3">
                  Upcoming
                  <span className="ml-2 text-xs font-normal text-[var(--admin-nav-idle)]">
                    {upcoming.length}
                  </span>
                </h2>
                <BookingList bookings={upcoming} />
              </section>
            )}

            {/* Past */}
            {past.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-[var(--admin-workspace-fg)] mb-3">
                  Past
                  <span className="ml-2 text-xs font-normal text-[var(--admin-nav-idle)]">
                    {past.length}
                  </span>
                </h2>
                <BookingList bookings={past} muted />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── BookingList ──────────────────────────────────────────────────────────────

type BookingRow = {
  id: string;
  contact_name: string;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
};

function BookingList({
  bookings,
  muted = false,
}: {
  bookings: BookingRow[];
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] divide-y divide-[var(--admin-border)]">
      {bookings.map((booking) => (
        <Link
          key={booking.id}
          href={`/admin/inquiries/${booking.id}`}
          className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--admin-nav-idle)]/5 transition-colors group"
        >
          {/* Date badge */}
          <div
            className={[
              "flex-none w-12 text-center",
              muted ? "opacity-50" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {booking.event_date ? (
              <>
                <p className="text-[11px] font-medium text-[var(--admin-nav-idle)] uppercase leading-none">
                  {new Intl.DateTimeFormat("en-GB", { month: "short" }).format(
                    new Date(booking.event_date),
                  )}
                </p>
                <p className="text-lg font-semibold text-[var(--admin-workspace-fg)] leading-tight tabular-nums">
                  {new Date(booking.event_date).getDate()}
                </p>
              </>
            ) : (
              <p className="text-xs text-[var(--admin-nav-idle)]">TBD</p>
            )}
          </div>

          {/* Name + location */}
          <div className="min-w-0 flex-1">
            <p
              className={[
                "truncate text-sm font-medium group-hover:text-[var(--admin-accent)] transition-colors",
                muted
                  ? "text-[var(--admin-nav-idle)]"
                  : "text-[var(--admin-workspace-fg)]",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {booking.contact_name}
            </p>
            {(booking.company || booking.event_location) && (
              <p className="truncate text-xs text-[var(--admin-nav-idle)]">
                {[booking.company, booking.event_location]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>

          {/* Quantity */}
          {booking.quantity != null && booking.quantity > 0 && (
            <span className="flex-none text-xs text-[var(--admin-nav-idle)] tabular-nums">
              {booking.quantity} {booking.quantity === 1 ? "talent" : "talents"}
            </span>
          )}

          {/* Confirmed badge */}
          <span className="flex-none inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            Confirmed
          </span>
        </Link>
      ))}
    </div>
  );
}

