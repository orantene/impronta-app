import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import {
  AdminEntityLinkBadges,
  AdminFutureWorkspaceSlot,
  AdminParentTrail,
  AdminRelationshipContextStrip,
} from "@/components/admin/admin-entity-context";
import { EditClientAccountButton } from "@/components/admin/create-client-account-sheet";
import { CreateClientContactSheetTrigger } from "@/components/admin/create-client-contact-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { TalentPageHeader } from "@/components/talent/talent-dashboard-primitives";
import {
  ADMIN_LIST_TILE_HOVER,
  ADMIN_OUTLINE_CONTROL_CLASS,
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { formatClientLocationAccountType } from "@/lib/admin/validation";
import { CLIENT_ERROR, isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import { requireAdminTenantGuard } from "@/lib/saas/admin-scope";

type AdminClientAccountDetailRow = {
  id: string;
  name: string;
  account_type: string;
  account_type_detail?: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  website_url: string | null;
  location_text: string | null;
  city?: string | null;
  country?: string | null;
  address_notes?: string | null;
  google_place_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  internal_notes: string | null;
};

export default async function AdminClientAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, tenantId } = await requireAdminTenantGuard();

  const accountSelectExtended =
    "id, name, account_type, account_type_detail, primary_email, primary_phone, website_url, location_text, city, country, address_notes, google_place_id, latitude, longitude, internal_notes";
  const accountSelectBase =
    "id, name, account_type, primary_email, primary_phone, website_url, location_text, internal_notes";

  let account: Record<string, unknown> | null = null;
  let accErr: { message?: string } | null = null;

  const accFirst = await supabase
    .from("client_accounts")
    .select(accountSelectExtended)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (accFirst.error && isPostgrestMissingColumnError(accFirst.error)) {
    logServerError("admin/accounts/detail/schema-fallback", accFirst.error);
    const accFb = await supabase
      .from("client_accounts")
      .select(accountSelectBase)
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    account = accFb.data as Record<string, unknown> | null;
    accErr = accFb.error;
  } else {
    account = accFirst.data as Record<string, unknown> | null;
    accErr = accFirst.error;
  }

  const [{ data: contacts, error: conErr }, { data: accountInquiries }, { data: accountBookings }] =
    await Promise.all([
      supabase
        .from("client_account_contacts")
        .select("id, full_name, email, phone, whatsapp_phone, job_title, is_primary")
        .eq("tenant_id", tenantId)
        .eq("client_account_id", id)
        .is("archived_at", null)
        .order("full_name", { ascending: true }),
      supabase
        .from("inquiries")
        .select("id, contact_name, status, created_at")
        .eq("tenant_id", tenantId)
        .eq("client_account_id", id)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("agency_bookings")
        .select("id, title, status, starts_at, total_client_revenue")
        .eq("tenant_id", tenantId)
        .eq("client_account_id", id)
        .order("updated_at", { ascending: false })
        .limit(40),
    ]);

  if (accErr) {
    logServerError("admin/accounts/detail", accErr);
    return <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>;
  }
  if (conErr) {
    logServerError("admin/accounts/contacts", conErr);
  }
  if (!account) notFound();
  const acc = account as AdminClientAccountDetailRow;

  const { data: sampleInquiryClient } = await supabase
    .from("inquiries")
    .select("client_user_id")
    .eq("tenant_id", tenantId)
    .eq("client_account_id", id)
    .not("client_user_id", "is", null)
    .limit(1)
    .maybeSingle();
  const sampleUid = sampleInquiryClient?.client_user_id as string | undefined;
  const { data: sampleClientProfile } = sampleUid
    ? await supabase.from("profiles").select("display_name").eq("id", sampleUid).maybeSingle()
    : { data: null as { display_name: string | null } | null };
  const primaryContact = (contacts ?? []).find((c) => c.is_primary) ?? (contacts ?? [])[0];
  const nInq = accountInquiries?.length ?? 0;
  const nBk = accountBookings?.length ?? 0;

  function buildAdminBookingsHrefForAccount(accountId: string) {
    return `/admin/bookings?client_account_id=${encodeURIComponent(accountId)}`;
  }

  const accountStripItems = [
    {
      key: "self",
      label: "Location",
      text: String(acc.name),
      href: null as string | null,
      empty: false,
    },
    {
      key: "pc",
      label: "Client",
      text: (sampleClientProfile?.display_name as string | null)?.trim() || "—",
      href: sampleUid ? `/admin/clients/${sampleUid}` : null,
      empty: !sampleUid,
    },
    {
      key: "con",
      label: "Contact",
      text: primaryContact?.full_name ? String(primaryContact.full_name) : "—",
      href: primaryContact ? `/admin/accounts/${id}#contacts` : null,
      empty: !primaryContact,
    },
    {
      key: "inq",
      label: "Requests",
      text: nInq === 0 ? "—" : `${nInq} linked`,
      href: nInq > 0 ? `/admin/inquiries?client_account_id=${encodeURIComponent(id)}` : null,
      empty: nInq === 0,
    },
    {
      key: "bk",
      label: "Bookings",
      text: nBk === 0 ? "—" : `${nBk} jobs`,
      href: nBk > 0 ? buildAdminBookingsHrefForAccount(id) : null,
      empty: nBk === 0,
    },
  ];

  const accountLinkBadges = [
    {
      key: "to-inq",
      label: "→ Requests",
      href: `/admin/inquiries?client_account_id=${encodeURIComponent(id)}`,
    },
    {
      key: "to-bk",
      label: "→ Bookings",
      href: buildAdminBookingsHrefForAccount(id),
    },
  ];

  return (
    <div className={ADMIN_PAGE_STACK}>
      <Button variant="outline" size="sm" className={cn("w-fit rounded-full", ADMIN_OUTLINE_CONTROL_CLASS)} asChild>
        <Link href="/admin/accounts" scroll={false}>
          ← Work Locations
        </Link>
      </Button>

      <AdminParentTrail items={[{ label: "Work Locations", href: "/admin/accounts" }, { label: "This location" }]} />

      <TalentPageHeader
        icon={Building2}
        title={acc.name}
        description={[
          acc.primary_email,
          acc.primary_phone,
          acc.location_text,
        ]
          .filter(Boolean)
          .join(" · ")}
        right={
          <Badge variant="outline" className="normal-case">
            {formatClientLocationAccountType(
              String(acc.account_type),
              (acc.account_type_detail as string | null) ?? null,
            )}
          </Badge>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <EditClientAccountButton
          account={{
            id: acc.id,
            name: acc.name,
            account_type: acc.account_type,
            account_type_detail: acc.account_type_detail ?? null,
            primary_email: acc.primary_email ?? null,
            primary_phone: acc.primary_phone ?? null,
            website_url: acc.website_url ?? null,
            country: acc.country ?? null,
            city: acc.city ?? null,
            location_text: acc.location_text ?? null,
            address_notes: acc.address_notes ?? null,
            google_place_id: acc.google_place_id ?? null,
            latitude: acc.latitude ?? null,
            longitude: acc.longitude ?? null,
          }}
          label="Edit location"
        />
      </div>

      <AdminRelationshipContextStrip items={accountStripItems} />
      <AdminEntityLinkBadges badges={accountLinkBadges} />

      <DashboardSectionCard
        title="Location details"
        description={null}
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {acc.primary_email ? (
            <>
              <dt className="text-muted-foreground">Email</dt>
              <dd>
                <a
                  href={`mailto:${encodeURIComponent(String(acc.primary_email))}`}
                  className="text-[var(--impronta-gold)] underline-offset-4 hover:underline"
                >
                  {String(acc.primary_email)}
                </a>
              </dd>
            </>
          ) : null}
          {acc.primary_phone ? (
            <>
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="text-muted-foreground">{String(acc.primary_phone)}</dd>
            </>
          ) : null}
          {acc.country ? (
            <>
              <dt className="text-muted-foreground">Country</dt>
              <dd className="text-muted-foreground">{String(acc.country)}</dd>
            </>
          ) : null}
          {acc.city ? (
            <>
              <dt className="text-muted-foreground">City</dt>
              <dd className="text-muted-foreground">{String(acc.city)}</dd>
            </>
          ) : null}
          {acc.location_text ? (
            <>
              <dt className="text-muted-foreground sm:col-span-2">Full address</dt>
              <dd className="sm:col-span-2 whitespace-pre-wrap text-muted-foreground">
                {String(acc.location_text)}
              </dd>
            </>
          ) : null}
          {acc.address_notes ? (
            <>
              <dt className="text-muted-foreground sm:col-span-2">Address notes</dt>
              <dd className="sm:col-span-2 whitespace-pre-wrap text-muted-foreground">
                {String(acc.address_notes)}
              </dd>
            </>
          ) : null}
          {acc.google_place_id || (acc.latitude != null && acc.longitude != null) ? (
            <>
              <dt className="text-muted-foreground sm:col-span-2">Map</dt>
              <dd className="sm:col-span-2">
                <a
                  href={
                    acc.google_place_id
                      ? `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(String(acc.google_place_id))}`
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${String(acc.latitude)},${String(acc.longitude)}`)}`
                  }
                  className="text-[var(--impronta-gold)] underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Google Maps
                </a>
                {acc.latitude != null && acc.longitude != null ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {Number(acc.latitude).toFixed(5)}, {Number(acc.longitude).toFixed(5)}
                  </span>
                ) : null}
              </dd>
            </>
          ) : null}
          {acc.website_url ? (
            <>
              <dt className="text-muted-foreground">Website</dt>
              <dd>
                <a
                  href={
                    String(acc.website_url).match(/^https?:\/\//i)
                      ? String(acc.website_url)
                      : `https://${String(acc.website_url)}`
                  }
                  className="text-[var(--impronta-gold)] underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {acc.website_url}
                </a>
              </dd>
            </>
          ) : null}
          {acc.internal_notes ? (
            <>
              <dt className="text-muted-foreground sm:col-span-2">Internal notes</dt>
              <dd className="sm:col-span-2 whitespace-pre-wrap text-muted-foreground">{acc.internal_notes}</dd>
            </>
          ) : null}
        </dl>
      </DashboardSectionCard>

      <div id="contacts" className="scroll-mt-20" />
      <DashboardSectionCard
        title="Contacts"
        description="People who coordinate with Impronta for this Work Location."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        {!contacts?.length ? (
          <p className="text-sm text-muted-foreground">
            No contacts yet — people who represent this Work Location (not portal Client logins).
          </p>
        ) : (
          <ul className="mb-6 space-y-3 text-sm">
            {contacts.map((c) => (
              <li key={c.id} className="rounded-md border border-border/45 p-3">
                <p className="font-medium">
                  {c.full_name}
                  {c.is_primary ? (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      Primary
                    </Badge>
                  ) : null}
                </p>
                <p className="text-muted-foreground">
                  {[c.job_title, c.email, c.phone ?? c.whatsapp_phone].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mb-3 text-sm text-muted-foreground">
          Add someone who coordinates with Impronta for this Work Location without leaving the page.
        </p>
        <CreateClientContactSheetTrigger
          accountOptions={[{ id: acc.id as string, name: acc.name as string }]}
          lockedAccountId={id}
          lockedAccountName={acc.name as string}
          variant="outline"
          label="Add contact"
        />
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Inquiries on this location"
        description="Client requests linked to this Work Location."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        {!accountInquiries?.length ? (
          <p className="text-sm text-muted-foreground">No inquiries linked yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {accountInquiries.map((row) => (
              <li key={row.id as string} className={cn(ADMIN_LIST_TILE_HOVER, "flex flex-wrap items-center justify-between gap-2")}>
                <span className="text-muted-foreground">{new Date(row.created_at as string).toLocaleString()}</span>
                <Link
                  href={`/admin/inquiries/${row.id}`}
                  className="font-medium text-[var(--impronta-gold)] underline-offset-4 hover:underline"
                  scroll={false}
                >
                  {(row.contact_name as string) || "Inquiry"}
                </Link>
                <span className="text-xs capitalize text-muted-foreground">{(row.status as string).replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Bookings on this location"
        description="Confirmed jobs tied to this Work Location."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        {!accountBookings?.length ? (
          <p className="text-sm text-muted-foreground">No bookings linked yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {accountBookings.map((row) => (
              <li key={row.id as string} className={cn(ADMIN_LIST_TILE_HOVER, "flex flex-wrap items-center justify-between gap-2")}>
                <Link
                  href={`/admin/bookings/${row.id}`}
                  className="font-medium text-[var(--impronta-gold)] underline-offset-4 hover:underline"
                  scroll={false}
                >
                  {row.title as string}
                </Link>
                <span className="text-xs capitalize text-muted-foreground">{(row.status as string).replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </DashboardSectionCard>

      <AdminFutureWorkspaceSlot />
    </div>
  );
}
