import Link from "next/link";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/ui/help-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import {
  ADMIN_FORM_CONTROL,
  ADMIN_FORM_FIELD_STACK,
  ADMIN_FORM_GRID_GAP,
  ADMIN_LINK_PILL,
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
  LUXURY_GOLD_BUTTON_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { createLocationForm } from "./actions";
import { LocationRowsTable, type LocationRow } from "./location-rows-table";

export default async function AdminLocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; q?: string }>;
}) {
  const { show, q: qParam } = await searchParams;
  const showArchived = show === "archived";
  const filterQ = (qParam ?? "").trim();

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return <p className="text-sm text-muted-foreground">Supabase not configured.</p>;
  }

  let q = supabase
    .from("locations")
    .select("id, country_code, city_slug, display_name_en, display_name_es, archived_at")
    .order("display_name_en");
  if (!showArchived) q = q.is("archived_at", null);

  if (filterQ) {
    const escaped = filterQ.replace(/[%_]/g, "\\$&");
    q = q.or(
      `display_name_en.ilike.%${escaped}%,city_slug.ilike.%${escaped}%,country_code.ilike.%${escaped}%`,
    );
  }

  const { data, error } = await q;
  if (error) {
    logServerError("admin/locations/list", error);
    return <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>;
  }

  const locations = (data ?? []) as LocationRow[];

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={MapPin}
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>Locations</span>
            <Badge variant="outline" className="border-border/55">
              Canonical
            </Badge>
          </span>
        }
        description={
          <>
            Single source of truth for cities/countries. Updates keep{" "}
            <span className="font-mono text-[11px] text-foreground/90">location_country</span> /{" "}
            <span className="font-mono text-[11px] text-foreground/90">location_city</span> taxonomy terms in sync for
            filtering (read-only under{" "}
            <Link href="/admin/taxonomy" className="font-medium text-[var(--impronta-gold)] underline underline-offset-4">
              Taxonomy
            </Link>
            ).
          </>
        }
        right={
          <div className="flex w-full max-w-xs flex-col items-stretch gap-2 sm:items-end">
            <HelpTip content="This list defines which cities/countries exist. Talent profile location is chosen per talent on their admin page; taxonomy only mirrors these rows for filters." />
            <form className="flex w-full flex-col gap-2" action="/admin/locations" method="get">
              {showArchived ? <input type="hidden" name="show" value="archived" /> : null}
              <Input
                name="q"
                defaultValue={filterQ}
                placeholder="Search EN name, slug, country…"
                className={ADMIN_FORM_CONTROL}
              />
              <Button type="submit" size="sm" variant="secondary" className="w-full sm:w-auto sm:self-end">
                Search
              </Button>
            </form>
            {showArchived ? (
              <Link
                href={filterQ ? `/admin/locations?q=${encodeURIComponent(filterQ)}` : "/admin/locations"}
                scroll={false}
                className={ADMIN_LINK_PILL}
              >
                Show active
              </Link>
            ) : (
              <Link
                href={
                  filterQ
                    ? `/admin/locations?show=archived&q=${encodeURIComponent(filterQ)}`
                    : "/admin/locations?show=archived"
                }
                scroll={false}
                className={ADMIN_LINK_PILL}
              >
                Show archived
              </Link>
            )}
          </div>
        }
      />

      <DashboardSectionCard
        title="Add location"
        description="Adding or updating locations automatically syncs location_country / location_city taxonomy terms."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
          <form action={createLocationForm} className={cn("grid sm:grid-cols-2 lg:grid-cols-4", ADMIN_FORM_GRID_GAP)}>
            <div className={ADMIN_FORM_FIELD_STACK}>
              <Label htmlFor="country_code">Country code</Label>
              <Input
                id="country_code"
                name="country_code"
                placeholder="MX"
                required
                className={ADMIN_FORM_CONTROL}
              />
            </div>
            <div className={ADMIN_FORM_FIELD_STACK}>
              <Label htmlFor="city_slug">City slug</Label>
              <Input
                id="city_slug"
                name="city_slug"
                placeholder="cancun"
                required
                className={ADMIN_FORM_CONTROL}
              />
            </div>
            <div className={ADMIN_FORM_FIELD_STACK}>
              <Label htmlFor="display_name_en">Name (EN)</Label>
              <Input
                id="display_name_en"
                name="display_name_en"
                placeholder="Cancún"
                required
                className={ADMIN_FORM_CONTROL}
              />
            </div>
            <div className={ADMIN_FORM_FIELD_STACK}>
              <Label htmlFor="display_name_es">Name (ES)</Label>
              <Input id="display_name_es" name="display_name_es" placeholder="Cancún" className={ADMIN_FORM_CONTROL} />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit" className={cn("rounded-xl", LUXURY_GOLD_BUTTON_CLASS)}>
                Create location
              </Button>
            </div>
          </form>
      </DashboardSectionCard>

      {locations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {showArchived ? "No archived locations." : "No locations yet. Add one above."}
        </p>
      ) : (
        <DashboardSectionCard
          title="All locations"
          description={`${locations.length} location${locations.length !== 1 ? "s" : ""}`}
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <LocationRowsTable locations={locations} />
        </DashboardSectionCard>
      )}
    </div>
  );
}
