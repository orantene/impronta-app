import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarRange,
  ChevronRight,
  Layers3,
  Users,
  Waypoints,
} from "lucide-react";
import {
  InquiryClientCardForm,
  InquiryLocationCardForm,
  InquiryRequestDetailsForm,
  InquiryUpdateForm,
  NewBookingForm,
} from "@/app/(dashboard)/admin/inquiries/[id]/admin-inquiry-forms";
import { DuplicateInquiryForm } from "@/app/(dashboard)/admin/inquiries/[id]/duplicate-inquiry-form";
import { InquiryConvertBookingPanel } from "@/app/(dashboard)/admin/inquiries/[id]/inquiry-convert-booking";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { AdminCopyEntityIdButton } from "@/components/admin/admin-copy-entity-id-button";
import { CommercialActivityPanel } from "@/components/admin/commercial-activity-panel";
import { InquiryTalentEditor } from "@/components/admin/inquiry-talent-editor";
import { Button } from "@/components/ui/button";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import {
  ADMIN_LIST_TILE_HOVER,
  ADMIN_OUTLINE_CONTROL_CLASS,
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
  LUXURY_GOLD_BUTTON_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { mapRawActivityRows } from "@/lib/commercial-activity-summary";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { loadInquiryRoster } from "@/lib/inquiry/inquiry-workspace-data";
import type { OfferLineDraft } from "@/lib/inquiry/inquiry-engine";
import { InquiryMessageThread } from "@/components/inquiry/inquiry-message-thread";
import { InquiryV2OfferEditor } from "@/app/(dashboard)/admin/inquiries/[id]/inquiry-v2-offer-editor";
import { actionCreateDraftOffer } from "@/app/(dashboard)/admin/inquiries/[id]/offer-actions";
import { actionSendInquiryMessage } from "@/app/(dashboard)/admin/inquiries/[id]/messaging-actions";
import { ChevronDown } from "lucide-react";
import type React from "react";

type BookingTalentRow = {
  id: string;
  talent_profile_id: string | null;
  talent_name_snapshot: string | null;
  profile_code_snapshot: string | null;
  talent_profiles: {
    profile_code: string;
    display_name: string | null;
  } | null;
};

type BookingListRow = {
  id: string;
  title: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  notes: string | null;
  internal_notes: string | null;
  payment_status: string | null;
  total_client_revenue: number | null;
  gross_profit: number | null;
  booking_talent: BookingTalentRow[] | null;
};

type InquiryTalentRow = {
  id: string;
  talent_profile_id: string;
  sort_order: number;
  talent_profiles: {
    id: string;
    profile_code: string;
    display_name: string | null;
  } | null;
};

type MediaAssetRow = {
  owner_talent_profile_id: string | null;
  bucket_id: string | null;
  storage_path: string | null;
  variant_kind: string | null;
  sort_order: number | null;
  created_at: string;
};

type TalentTaxonomyRow = {
  talent_profile_id: string;
  is_primary: boolean;
  taxonomy_terms:
    | { kind: string | null; name_en: string | null }
    | { kind: string | null; name_en: string | null }[]
    | null;
};

function titleCase(value: string | null | undefined) {
  const formatted = (value ?? "").replace(/_/g, " ").trim();
  if (!formatted) return null;
  return formatted.replace(/\b\w/g, (c) => c.toUpperCase());
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function SecondarySection({
  id,
  title,
  description,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  id?: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group rounded-[1.7rem] border border-border/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(247,244,237,0.48))] shadow-sm transition-colors open:border-[var(--impronta-gold-border)]/45"
    >
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--impronta-gold-border)]/65 bg-[var(--impronta-gold-muted)] text-[var(--impronta-gold)] shadow-sm">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/75 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors group-hover:border-border">
            <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180" />
          </div>
        </div>
      </summary>
      <div className="border-t border-border/40 px-5 py-5">{children}</div>
    </details>
  );
}

export default async function AdminInquiryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ convert_error?: string; dup_err?: string }>;
}) {
  const { id } = await params;
  const { convert_error: convertError, dup_err: dupErr } = await searchParams;
  const supabase = await getCachedServerSupabase();
  if (!supabase) notFound();

  const { data: inquiry, error } = await supabase
    .from("inquiries")
    .select(
      `
      id,
      status,
      client_user_id,
      guest_session_id,
      client_account_id,
      client_contact_id,
      source_channel,
      closed_reason,
      contact_name,
      contact_email,
      contact_phone,
      company,
      event_location,
      message,
      raw_ai_query,
      source_page,
      staff_notes,
      assigned_staff_id,
      created_at,
      updated_at,
      uses_new_engine,
      version,
      coordinator_id,
      next_action_by,
      current_offer_id,
      booked_at
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !inquiry) notFound();

  const engineV2 = Boolean((inquiry as { uses_new_engine?: boolean }).uses_new_engine);

  const [{ data: staff }, { data: bookings }, { data: accounts }, { data: contactRows }, { data: linkedAccount }, { data: linkedContact }, { data: inqLogs }, { data: platformClientProfile }, { data: allTalents }] =
    await Promise.all([
      supabase.from("profiles").select("id, display_name").in("app_role", ["super_admin", "agency_staff"]),
      supabase
        .from("agency_bookings")
        .select(
          `id, title, status, starts_at, ends_at, notes, internal_notes, payment_status, total_client_revenue, gross_profit,
           booking_talent (id, talent_profile_id, talent_name_snapshot, profile_code_snapshot, talent_profiles (profile_code, display_name))`,
        )
        .eq("source_inquiry_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("client_accounts")
        .select(
          "id, name, account_type, account_type_detail, primary_email, primary_phone, website_url, country, city, location_text, address_notes, google_place_id, latitude, longitude",
        )
        .is("archived_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("client_account_contacts")
        .select("id, client_account_id, full_name, email, phone, client_accounts(name)")
        .is("archived_at", null)
        .order("full_name", { ascending: true }),
      inquiry.client_account_id
        ? supabase
            .from("client_accounts")
            .select(
              "id, name, account_type, account_type_detail, primary_email, primary_phone, website_url, country, city, location_text, address_notes, google_place_id, latitude, longitude",
            )
            .eq("id", inquiry.client_account_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      inquiry.client_contact_id
        ? supabase
            .from("client_account_contacts")
            .select("id, full_name, email, phone")
            .eq("id", inquiry.client_contact_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("inquiry_activity_log")
        .select("id, event_type, payload, created_at, actor_user_id")
        .eq("inquiry_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      inquiry.client_user_id
        ? supabase.from("profiles").select("id, display_name").eq("id", inquiry.client_user_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("talent_profiles").select("id, profile_code, display_name").is("deleted_at", null).order("profile_code", { ascending: true }).limit(500),
    ]);

  // Legacy-only shortlist read. v2 paths do not include inquiry_talent queries.
  const inquiryTalentRows = engineV2
    ? null
    : (
        await supabase
          .from("inquiry_talent")
          .select(`id, talent_profile_id, sort_order, talent_profiles (id, profile_code, display_name)`)
          .eq("inquiry_id", id)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true })
      ).data;

  const inquiryTalentProfileIds = [
    ...new Set(
      (((inquiryTalentRows ?? []) as unknown as InquiryTalentRow[]).map((r) => r.talent_profile_id).filter(Boolean)),
    ),
  ];

  const [{ data: mediaRows }, { data: taxonomyRows }] =
    inquiryTalentProfileIds.length > 0
      ? await Promise.all([
          supabase
            .from("media_assets")
            .select("owner_talent_profile_id, bucket_id, storage_path, variant_kind, sort_order, created_at")
            .in("owner_talent_profile_id", inquiryTalentProfileIds)
            .eq("approval_state", "approved")
            .is("deleted_at", null),
          supabase
            .from("talent_profile_taxonomy")
            .select("talent_profile_id, is_primary, taxonomy_terms(kind, name_en)")
            .in("talent_profile_id", inquiryTalentProfileIds),
        ])
      : [{ data: [] as MediaAssetRow[] }, { data: [] as TalentTaxonomyRow[] }];

  const mediaByTalent = new Map<string, MediaAssetRow[]>();
  for (const row of (mediaRows ?? []) as MediaAssetRow[]) {
    if (!row.owner_talent_profile_id) continue;
    const current = mediaByTalent.get(row.owner_talent_profile_id) ?? [];
    current.push(row);
    mediaByTalent.set(row.owner_talent_profile_id, current);
  }

  const thumbnailMap = new Map<string, string>();
  for (const [talentId, rows] of mediaByTalent.entries()) {
    const best = [...rows]
      .filter((r) => r.bucket_id === "media-public" && typeof r.storage_path === "string" && r.storage_path.length > 0)
      .sort((a, b) => {
        const rank = (v: string | null) => (v === "card" ? 0 : v === "public_watermarked" ? 1 : v === "gallery" ? 2 : 3);
        return rank(a.variant_kind) - rank(b.variant_kind) || (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.created_at.localeCompare(b.created_at);
      })[0];
    if (best?.storage_path) {
      const { data } = supabase.storage.from("media-public").getPublicUrl(best.storage_path);
      if (data.publicUrl) thumbnailMap.set(talentId, data.publicUrl);
    }
  }

  const talentTagMap = new Map<string, string>();
  for (const row of (taxonomyRows ?? []) as TalentTaxonomyRow[]) {
    const term = Array.isArray(row.taxonomy_terms) ? row.taxonomy_terms[0] : row.taxonomy_terms;
    if (term?.kind !== "talent_type" || !term.name_en?.trim()) continue;
    if (!talentTagMap.has(row.talent_profile_id) || row.is_primary) {
      talentTagMap.set(row.talent_profile_id, term.name_en.trim());
    }
  }

  let v2Offer: {
    id: string;
    version: number;
    status: string;
    total_client_price: number;
    coordinator_fee: number;
    currency_code: string;
    notes: string | null;
  } | null = null;
  let v2OfferLines: OfferLineDraft[] = [];
  let v2Approvals: { id: string; status: string; participant_id: string; offer_id: string | null }[] = [];
  let v2PrivateMessages: {
    id: string;
    body: string;
    created_at: string;
    sender_user_id: string | null;
    metadata: Record<string, unknown>;
  }[] = [];

  if (engineV2) {
    const { data: msgs } = await supabase
      .from("inquiry_messages")
      .select("id, body, created_at, sender_user_id, metadata")
      .eq("inquiry_id", id)
      .eq("thread_type", "private")
      .order("created_at", { ascending: true })
      .limit(200);
    v2PrivateMessages = (msgs ?? []) as typeof v2PrivateMessages;

    const cid = (inquiry as { current_offer_id?: string | null }).current_offer_id;
    if (cid) {
      const [{ data: offer }, { data: lines }, { data: approvals }] = await Promise.all([
        supabase
          .from("inquiry_offers")
          .select("id, version, status, total_client_price, coordinator_fee, currency_code, notes")
          .eq("id", cid)
          .maybeSingle(),
        supabase.from("inquiry_offer_line_items").select("*").eq("offer_id", cid).order("sort_order", { ascending: true }),
        supabase.from("inquiry_approvals").select("id, status, participant_id, offer_id").eq("offer_id", cid),
      ]);
      if (offer) {
        v2Offer = {
          id: offer.id as string,
          version: offer.version as number,
          status: offer.status as string,
          total_client_price: Number(offer.total_client_price),
          coordinator_fee: Number(offer.coordinator_fee),
          currency_code: String(offer.currency_code ?? "MXN"),
          notes: (offer.notes as string | null) ?? null,
        };
        v2OfferLines = ((lines ?? []) as Record<string, unknown>[]).map((row, i) => ({
          talent_profile_id: (row.talent_profile_id as string | null) ?? null,
          label: (row.label as string | null) ?? null,
          pricing_unit: (["hour", "day", "week", "event"].includes(String(row.pricing_unit))
            ? row.pricing_unit
            : "event") as OfferLineDraft["pricing_unit"],
          units: Number(row.units) || 1,
          unit_price: Number(row.unit_price) || 0,
          total_price: Number(row.total_price) || 0,
          talent_cost: Number(row.talent_cost) || 0,
          notes: (row.notes as string | null) ?? null,
          sort_order: Number(row.sort_order) ?? i,
        }));
        v2Approvals = (approvals ?? []) as typeof v2Approvals;
      }
    }
  }

  const typedInquiryTalents = engineV2
    ? (await loadInquiryRoster(supabase, id)).map((r) => ({
        id: r.id,
        talent_profile_id: r.talentProfileId,
        sort_order: r.sortOrder,
        profile_code: r.profileCode,
        display_name: r.displayName,
        image_url: r.imageUrl,
        tag_label: r.tagLabel,
      }))
    : ((inquiryTalentRows ?? []) as unknown as InquiryTalentRow[])
        .filter((r) => r.talent_profiles)
        .map((r) => ({
          id: r.id,
          talent_profile_id: r.talent_profile_id,
          sort_order: r.sort_order,
          profile_code: r.talent_profiles!.profile_code,
          display_name: r.talent_profiles!.display_name,
          image_url: thumbnailMap.get(r.talent_profile_id) ?? null,
          tag_label: talentTagMap.get(r.talent_profile_id) ?? null,
        }));

  const contactOptions = (
    (contactRows ?? []) as {
      id: string;
      client_account_id: string;
      full_name: string;
      email: string | null;
      phone: string | null;
      client_accounts: { name: string } | { name: string }[] | null;
    }[]
  ).map((row) => {
    const acc = Array.isArray(row.client_accounts) ? row.client_accounts[0] : row.client_accounts;
    return {
      id: row.id,
      client_account_id: row.client_account_id,
      label: acc?.name ? `${row.full_name} · ${acc.name}` : row.full_name,
    };
  });

  const convertTalents = typedInquiryTalents.map((r) => ({
    talent_profile_id: r.talent_profile_id,
    profile_code: r.profile_code,
    display_name: r.display_name,
  }));

  const existingBookingsForConvert = ((bookings ?? []) as unknown as BookingListRow[]).map((b) => ({
    id: b.id,
    title: b.title,
    status: b.status,
  }));

  const defaultBookingTitle =
    [inquiry.raw_ai_query, inquiry.company, inquiry.contact_name].filter(Boolean).join(" · ") ||
    `${inquiry.contact_name} — booking`;

  const inqLogActorIds = [...new Set((inqLogs ?? []).map((l) => l.actor_user_id).filter(Boolean))] as string[];
  const { data: inqLogActors } =
    inqLogActorIds.length > 0
      ? await supabase.from("profiles").select("id, display_name").in("id", inqLogActorIds)
      : { data: [] as { id: string; display_name: string | null }[] };
  const inqActorMap = new Map((inqLogActors ?? []).map((r) => [r.id, r.display_name?.trim() || "Staff"]));
  const inquiryActivityEntries = mapRawActivityRows(
    (inqLogs ?? []) as { id: string; created_at: string; event_type: string; payload: unknown; actor_user_id: string | null }[],
    inqActorMap,
  );

  const assignedStaffLabel = inquiry.assigned_staff_id
    ? ((staff ?? []).find((p) => p.id === inquiry.assigned_staff_id)?.display_name ?? "Staff")
    : "Unassigned";

  const sourceChannelLabel = titleCase(inquiry.source_channel) ?? "Unknown";
  const nBookings = (bookings ?? []).length;

  const currentAccountForEdit = linkedAccount
    ? {
        id: linkedAccount.id,
        name: linkedAccount.name,
        account_type: linkedAccount.account_type,
        account_type_detail: linkedAccount.account_type_detail,
        primary_email: linkedAccount.primary_email,
        primary_phone: linkedAccount.primary_phone,
        website_url: linkedAccount.website_url,
        country: linkedAccount.country,
        city: linkedAccount.city,
        location_text: linkedAccount.location_text,
        address_notes: linkedAccount.address_notes,
        google_place_id: linkedAccount.google_place_id,
        latitude: linkedAccount.latitude,
        longitude: linkedAccount.longitude,
      }
    : null;

  const locationSummary = linkedAccount
    ? [linkedAccount.city, linkedAccount.country, titleCase(linkedAccount.account_type)].filter(Boolean).join(" · ")
    : null;

  return (
    <div className={ADMIN_PAGE_STACK}>

      {/* ── Breadcrumb ─────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link
          href="/admin/inquiries"
          scroll={false}
          className="flex items-center gap-1 hover:text-[var(--impronta-gold)] hover:underline underline-offset-4"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Inquiries
        </Link>
        <ChevronRight className="size-3 opacity-40" aria-hidden />
        <span className="truncate max-w-[220px] text-foreground/80">
          {inquiry.contact_name || "Unnamed inquiry"}
        </span>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/45 bg-card/60 px-6 py-5 shadow-sm">
        {/* Top meta row */}
        <div className="flex flex-wrap items-center gap-2">
          <AdminCommercialStatusBadge kind="inquiry" status={inquiry.status} className="px-3 py-1 text-sm" />
          <span className="rounded-full border border-border/50 bg-muted/20 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {sourceChannelLabel}
          </span>
          <span className="rounded-full border border-border/50 bg-muted/20 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {assignedStaffLabel}
          </span>
          <span className="ml-auto text-[11px] text-muted-foreground/70">
            {relativeTime(inquiry.created_at)}
          </span>
          <AdminCopyEntityIdButton id={inquiry.id} />
        </div>

        {/* Title: contact name */}
        <h1 className="mt-3 font-display text-xl font-semibold tracking-tight text-foreground">
          {inquiry.contact_name || "Unnamed inquiry"}
        </h1>

        {/* Identity line: company + email + phone */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
          {inquiry.company ? (
            <span className="font-medium text-foreground/80">{inquiry.company}</span>
          ) : null}
          {inquiry.contact_email ? <span>{inquiry.contact_email}</span> : null}
          {inquiry.contact_phone ? <span>{inquiry.contact_phone}</span> : null}
          {platformClientProfile?.display_name ? (
            <Link
              href={`/admin/clients/${inquiry.client_user_id}`}
              scroll={false}
              className="text-[var(--impronta-gold)] underline-offset-4 hover:underline"
            >
              Portal: {platformClientProfile.display_name}
            </Link>
          ) : null}
        </div>

        {/* What they asked */}
        {inquiry.raw_ai_query?.trim() ? (
          <blockquote className="mt-3 border-l-2 border-[var(--impronta-gold)]/40 pl-3 text-sm italic text-muted-foreground">
            "{inquiry.raw_ai_query.trim()}"
          </blockquote>
        ) : inquiry.message?.trim() ? (
          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{inquiry.message.trim()}</p>
        ) : null}

        {/* KPI strip */}
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border/35 pt-4 sm:grid-cols-4">
          <div className="flex flex-col gap-0.5 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Talent</span>
            <span className="font-display text-2xl font-semibold tabular-nums text-foreground">
              {typedInquiryTalents.length}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Bookings</span>
            <span
              className={cn(
                "font-display text-2xl font-semibold tabular-nums",
                nBookings > 0 ? "text-[var(--impronta-gold)]" : "text-foreground",
              )}
            >
              {nBookings}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Location</span>
            <span className="truncate text-sm font-medium text-foreground">
              {linkedAccount?.name ?? <span className="text-muted-foreground">—</span>}
            </span>
            {locationSummary ? (
              <span className="truncate text-[11px] text-muted-foreground">{locationSummary}</span>
            ) : null}
          </div>
          <div className="flex flex-col gap-0.5 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Event spot</span>
            <span className="truncate text-sm font-medium text-foreground">
              {inquiry.event_location?.trim() || <span className="text-muted-foreground">—</span>}
            </span>
          </div>
        </div>
      </div>

      {/* ── Main forms grid ────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* Client */}
        <DashboardSectionCard
          title="Client"
          description="Who is making this request."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <InquiryClientCardForm
            inquiry={{
              id: inquiry.id,
              contact_name: inquiry.contact_name,
              contact_email: inquiry.contact_email,
              contact_phone: inquiry.contact_phone,
              company: inquiry.company,
              client_user_id: inquiry.client_user_id,
            }}
            linkedClient={
              platformClientProfile
                ? { id: inquiry.client_user_id!, displayName: platformClientProfile.display_name }
                : null
            }
          />
        </DashboardSectionCard>

        {/* Location */}
        <DashboardSectionCard
          title="Work Location"
          description="Place or business this work is for."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          {linkedAccount ? (
            <div className="mb-4 rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
              <p className="text-sm font-medium text-foreground">{linkedAccount.name}</p>
              {locationSummary ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{locationSummary}</p>
              ) : null}
              {linkedContact ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Contact: {linkedContact.full_name}
                  {linkedContact.phone ? ` · ${linkedContact.phone}` : ""}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mb-4 text-sm text-muted-foreground">No location linked yet.</p>
          )}
          <InquiryLocationCardForm
            inquiryId={inquiry.id}
            accounts={(accounts ?? []) as { id: string; name: string }[]}
            contacts={contactOptions}
            currentAccountId={inquiry.client_account_id}
            currentContactId={inquiry.client_contact_id}
            currentAccount={currentAccountForEdit}
          />
        </DashboardSectionCard>

        {/* Talent */}
        <DashboardSectionCard
          title="Talent shortlist"
          description="Add, remove, and reorder before converting to a booking."
          right={
            <span className="rounded-full border border-[var(--impronta-gold-border)]/60 bg-[var(--impronta-gold-muted)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--impronta-gold)]">
              {typedInquiryTalents.length} selected
            </span>
          }
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
          className="xl:col-span-2"
        >
          <InquiryTalentEditor
            inquiryId={inquiry.id}
            allTalents={(allTalents ?? []) as { id: string; profile_code: string; display_name: string | null }[]}
            rows={typedInquiryTalents}
            engineV2={engineV2}
            inquiryVersion={(inquiry as { version?: number }).version ?? 1}
          />
        </DashboardSectionCard>

        {/* Request details */}
        <DashboardSectionCard
          title="Request details"
          description="Brief, event location, source, and internal notes."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
          className="xl:col-span-2"
        >
          <InquiryRequestDetailsForm
            inquiry={{
              id: inquiry.id,
              raw_ai_query: inquiry.raw_ai_query,
              message: inquiry.message,
              event_location: inquiry.event_location,
              source_channel: inquiry.source_channel ?? "directory_guest",
              staff_notes: inquiry.staff_notes,
            }}
          />
        </DashboardSectionCard>

        {engineV2 ? (
          <>
            <DashboardSectionCard
              title="Messages (private)"
              description="Client ↔ coordinator thread for this inquiry."
              titleClassName={ADMIN_SECTION_TITLE_CLASS}
              className="xl:col-span-2"
            >
              <InquiryMessageThread
                inquiryId={inquiry.id}
                threadType="private"
                initialMessages={v2PrivateMessages}
                sendAction={actionSendInquiryMessage}
              />
            </DashboardSectionCard>

            <DashboardSectionCard
              title="Structured offer"
              description="Draft line items, save, then send to the client."
              titleClassName={ADMIN_SECTION_TITLE_CLASS}
              className="xl:col-span-2"
            >
              {v2Offer ? (
                <InquiryV2OfferEditor
                  inquiryId={inquiry.id}
                  inquiryVersion={(inquiry as { version?: number }).version ?? 1}
                  offer={v2Offer}
                  initialLines={v2OfferLines}
                />
              ) : (
                <form action={actionCreateDraftOffer} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="inquiry_id" value={inquiry.id} />
                  <input
                    type="hidden"
                    name="expected_version"
                    value={String((inquiry as { version?: number }).version ?? 1)}
                  />
                  <Button type="submit" variant="secondary">
                    Create draft offer
                  </Button>
                  <p className="text-xs text-muted-foreground">Creates an empty draft and links it as the current offer.</p>
                </form>
              )}
            </DashboardSectionCard>

            <DashboardSectionCard
              title="Approvals"
              description="Per-offer confirmations (client + active talents)."
              titleClassName={ADMIN_SECTION_TITLE_CLASS}
              className="xl:col-span-2"
            >
              {v2Approvals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No approval rows yet — they are created when an offer is sent.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {v2Approvals.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap justify-between gap-2 rounded-xl border border-border/40 bg-muted/10 px-3 py-2"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{a.participant_id.slice(0, 8)}…</span>
                      <span className="font-medium capitalize">{a.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </DashboardSectionCard>
          </>
        ) : null}
      </div>

      {/* ── Operations — open by default so status is always visible ── */}
      <SecondarySection
        title="Workflow & operations"
        description="Change status, reassign, or mark closed. These are the most important ops fields."
        icon={Users}
        defaultOpen
      >
        {convertError ? (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {(() => { try { return decodeURIComponent(convertError); } catch { return convertError; } })()}
          </p>
        ) : null}
        <InquiryUpdateForm
          inquiry={{
            id: inquiry.id,
            status: inquiry.status,
            assigned_staff_id: inquiry.assigned_staff_id,
            closed_reason: inquiry.closed_reason ?? null,
            staff_notes: inquiry.staff_notes ?? null,
            client_account_id: inquiry.client_account_id ?? null,
            client_contact_id: inquiry.client_contact_id ?? null,
            source_channel: inquiry.source_channel ?? "directory_guest",
          }}
          staff={staff ?? []}
        />
      </SecondarySection>

      {/* ── Linked bookings — shown prominently if they exist ───── */}
      {nBookings > 0 && (
        <SecondarySection
          id="linked-bookings"
          title={`Linked bookings (${nBookings})`}
          description="Jobs that were created from this inquiry."
          icon={CalendarRange}
          defaultOpen
        >
          <ul className="space-y-3">
            {((bookings ?? []) as unknown as BookingListRow[]).map((booking) => {
              const lines = booking.booking_talent ?? [];
              return (
                <li
                  key={booking.id}
                  className={cn(
                    ADMIN_LIST_TILE_HOVER,
                    "rounded-[1.4rem] border border-border/50 bg-background/75 p-4 text-sm shadow-sm",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/admin/bookings/${booking.id}`}
                      className="font-medium text-[var(--impronta-gold)] underline-offset-4 hover:underline"
                      scroll={false}
                    >
                      {booking.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminCommercialStatusBadge kind="booking" status={booking.status} />
                      <Button size="sm" variant="secondary" className="h-7 text-xs" asChild>
                        <Link href={`/admin/bookings/${booking.id}`} scroll={false}>
                          Open →
                        </Link>
                      </Button>
                    </div>
                  </div>
                  {booking.payment_status ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Payment: {booking.payment_status.replace(/_/g, " ")}
                      {booking.total_client_revenue != null ? ` · Revenue ${booking.total_client_revenue}` : ""}
                      {booking.gross_profit != null ? ` · Profit ${booking.gross_profit}` : ""}
                    </p>
                  ) : null}
                  {lines.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {lines.map((line) => {
                        const code = line.talent_profiles?.profile_code ?? line.profile_code_snapshot ?? "—";
                        const name = line.talent_profiles?.display_name ?? line.talent_name_snapshot ?? "";
                        return (
                          <li
                            key={line.id}
                            className="rounded-full border border-border/45 bg-muted/15 px-2.5 py-1 text-xs text-muted-foreground"
                          >
                            {code}{name ? ` · ${name}` : ""}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </SecondarySection>
      )}

      {/* ── Convert to booking ────────────────────────────────── */}
      <SecondarySection
        id="booking-tools"
        title={nBookings > 0 ? "Add to booking / create another" : "Convert to booking"}
        description={
          nBookings > 0
            ? "Attach more talent to an existing booking or create a new job from this inquiry."
            : "Turn this inquiry into a confirmed job. Pick talent from the shortlist above."
        }
        icon={CalendarRange}
        defaultOpen={nBookings === 0 || Boolean(convertError)}
      >
        <div className="space-y-4">
          {nBookings === 0 && (
            <p className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              No bookings linked yet. Use the form below to create the first job from this inquiry.
            </p>
          )}
          <InquiryConvertBookingPanel
            inquiryId={inquiry.id}
            defaultTitle={defaultBookingTitle}
            talents={convertTalents}
            existingBookings={existingBookingsForConvert}
            engineV2={engineV2}
            inquiryVersion={(inquiry as { version?: number }).version ?? 1}
          />
        </div>
      </SecondarySection>

      {/* ── Quick add booking (legacy shortcut) ───────────────── */}
      <SecondarySection
        title="Quick add booking"
        description="Manual shortcut — prefer Convert to Booking above for the full inquiry-to-booking flow."
        icon={CalendarRange}
        defaultOpen={false}
      >
        <NewBookingForm
          inquiryId={inquiry.id}
          talentOptions={convertTalents.map((r) => ({ id: r.talent_profile_id, profile_code: r.profile_code, display_name: r.display_name }))}
        />
      </SecondarySection>

      {/* ── Activity ─────────────────────────────────────────── */}
      <SecondarySection
        title="Activity log"
        description="Audit trail for conversions, duplicates, and link changes."
        icon={Waypoints}
        defaultOpen={false}
      >
        <CommercialActivityPanel title="Inquiry activity" description={null} entries={inquiryActivityEntries} />
      </SecondarySection>

      {/* ── Duplicate ────────────────────────────────────────── */}
      <SecondarySection
        title="Duplicate inquiry"
        description="Copy this inquiry into a new lead and optionally keep the location, contact, and shortlist."
        icon={Layers3}
        defaultOpen={Boolean(dupErr)}
      >
        {dupErr ? (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {(() => { try { return decodeURIComponent(dupErr); } catch { return dupErr; } })()}
          </p>
        ) : null}
        <DuplicateInquiryForm sourceInquiryId={inquiry.id} accounts={accounts ?? []} contacts={contactOptions} />
      </SecondarySection>

    </div>
  );
}
