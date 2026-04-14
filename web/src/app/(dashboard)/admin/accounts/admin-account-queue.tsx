"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AdminAccountRowTools } from "@/components/admin/admin-list-row-tools";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AccountQueueRow = {
  id: string;
  name: string;
  account_type: string;
  account_type_detail: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  website_url: string | null;
  location_text: string | null;
  city: string | null;
  country: string | null;
  address_notes: string | null;
  google_place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  // computed
  typeLabel: string;
  inquiriesCount: number;
  bookingsCount: number;
  linkedClientsCount: number;
  linkedClients: { id: string; name: string }[];
  latestInquiryAt: string | null;
  latestBookingAt: string | null;
};

export function AdminAccountQueue({ rows }: { rows: AccountQueueRow[] }) {
  const router = useRouter();
  const go = (id: string) => router.push(`/admin/accounts/${id}`);
  const prefetch = (id: string) => router.prefetch(`/admin/accounts/${id}`);

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border/60 bg-muted/[0.04] px-4 py-10 text-center text-sm text-muted-foreground">
        No work locations yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/45 bg-card/50 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.35)]">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-gradient-to-b from-muted/35 to-muted/10">
          <tr className="border-b border-border/45">
            <th className="px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Location
            </th>
            <th className="hidden px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:table-cell">
              Type
            </th>
            <th className="hidden px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground md:table-cell">
              Contact
            </th>
            <th className="hidden px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground lg:table-cell">
              Requests
            </th>
            <th className="hidden px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground lg:table-cell">
              Bookings
            </th>
            <th className="hidden px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground xl:table-cell">
              Clients
            </th>
            <th className="px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/25">
          {rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                "cursor-pointer transition-[background-color,box-shadow] duration-150",
                "hover:bg-[var(--impronta-gold)]/[0.06] hover:shadow-[inset_3px_0_0_0_var(--impronta-gold)]",
              )}
              onMouseEnter={() => prefetch(row.id)}
              onFocus={() => prefetch(row.id)}
              onClick={() => go(row.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  go(row.id);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Open location: ${row.name}`}
            >
              {/* Location name */}
              <td className="px-4 py-3.5">
                <p className="font-display text-[15px] font-medium tracking-tight text-foreground">
                  {row.name}
                </p>
                {(row.city || row.country) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[row.city, row.country].filter(Boolean).join(", ")}
                  </p>
                )}
                {/* Type on mobile */}
                <p className="mt-1 text-[11px] text-muted-foreground sm:hidden">{row.typeLabel}</p>
              </td>

              {/* Type */}
              <td className="hidden px-4 py-3.5 sm:table-cell">
                <span className="inline-flex items-center rounded-full border border-border/55 bg-muted/20 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {row.typeLabel}
                </span>
              </td>

              {/* Contact */}
              <td className="hidden max-w-[180px] px-4 py-3.5 md:table-cell">
                {row.primary_email ? (
                  <p className="truncate text-xs text-muted-foreground">{row.primary_email}</p>
                ) : null}
                {row.primary_phone ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.primary_phone}</p>
                ) : null}
                {!row.primary_email && !row.primary_phone && (
                  <span className="text-xs text-muted-foreground/60">—</span>
                )}
              </td>

              {/* Requests */}
              <td className="hidden px-4 py-3.5 lg:table-cell">
                {row.inquiriesCount > 0 ? (
                  <span className="tabular-nums text-sm font-medium text-foreground">
                    {row.inquiriesCount}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">reqs</span>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>

              {/* Bookings */}
              <td className="hidden px-4 py-3.5 lg:table-cell">
                {row.bookingsCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/[0.08] px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 tabular-nums">
                    {row.bookingsCount}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>

              {/* Linked clients */}
              <td className="hidden px-4 py-3.5 xl:table-cell">
                {row.linkedClientsCount > 0 ? (
                  <span className="tabular-nums text-sm font-medium text-foreground">
                    {row.linkedClientsCount}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>

              {/* Actions */}
              <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 rounded-xl border-[var(--impronta-gold)]/35 bg-background/90 text-[var(--impronta-gold)] shadow-sm hover:bg-[var(--impronta-gold)]/10"
                    asChild
                  >
                    <Link href={`/admin/accounts/${row.id}`} aria-label="Open location">
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                  <AdminAccountRowTools
                    account={{
                      id: row.id,
                      name: row.name,
                      account_type: row.account_type,
                      account_type_detail: row.account_type_detail,
                      primary_email: row.primary_email,
                      primary_phone: row.primary_phone,
                      website_url: row.website_url,
                      country: row.country,
                      city: row.city,
                      location_text: row.location_text,
                      address_notes: row.address_notes,
                      google_place_id: row.google_place_id,
                      latitude: row.latitude,
                      longitude: row.longitude,
                    }}
                    usage={{
                      linkedClientsCount: row.linkedClientsCount,
                      linkedClients: row.linkedClients,
                      inquiriesCount: row.inquiriesCount,
                      bookingsCount: row.bookingsCount,
                      latestInquiryAt: row.latestInquiryAt,
                      latestBookingAt: row.latestBookingAt,
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
