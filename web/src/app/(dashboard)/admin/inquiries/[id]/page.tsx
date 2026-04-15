import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
  LUXURY_GOLD_BUTTON_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { mapRawActivityRows } from "@/lib/commercial-activity-summary";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { loadInquiryRoster } from "@/lib/inquiry/inquiry-workspace-data";
import type { OfferLineDraft } from "@/lib/inquiry/inquiry-engine";
import { AdminInquiryWorkspaceV2 } from "@/app/(dashboard)/admin/inquiries/[id]/admin-inquiry-workspace-v2";
import { actionCreateDraftOffer } from "@/app/(dashboard)/admin/inquiries/[id]/offer-actions";
import { actionSendInquiryMessage } from "@/app/(dashboard)/admin/inquiries/[id]/messaging-actions";
import { actionReopenInquiry, actionStartInquiryReview } from "@/app/(dashboard)/admin/inquiries/[id]/workspace-flow-actions";
import { canonicalizeTab, isValidTab } from "@/lib/inquiry/inquiry-workspace-tab";
import { normalizeWorkspaceStatus, resolveEffectiveRole } from "@/lib/inquiry/inquiry-workspace-status";
import { isWorkspaceLocked } from "@/lib/inquiry/inquiry-workspace-lock";
import { getPrimaryAction } from "@/lib/inquiry/inquiry-primary-action";
import { getWorkspacePermissions } from "@/lib/inquiry/inquiry-workspace-permissions";
import { getProgressStep } from "@/lib/inquiry/inquiry-progress";
import { isOfferReady } from "@/lib/inquiry/inquiry-offer-readiness";
import { resolveApprovalCompleteness } from "@/lib/inquiry/inquiry-approval-resolver";
import type {
  InquiryWorkspaceApproval,
  InquiryWorkspaceInquiry,
  InquiryWorkspaceMessage,
  InquiryWorkspaceOffer,
  InquiryWorkspaceRosterEntry,
} from "@/lib/inquiry/inquiry-workspace-types";
import { ChevronDown } from "lucide-react";
import type React from "react";

function warnLegacyInquiryV2Render(inquiryId: string) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[qa-v2-cutover] Rendering admin inquiry ${inquiryId} in V2 despite uses_new_engine=false.`);
  }
}

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
  searchParams: Promise<{ convert_error?: string; dup_err?: string; tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { convert_error: convertError, dup_err: dupErr, tab: tabRaw } = sp;
  if (tabRaw != null && tabRaw !== "" && !isValidTab(tabRaw)) {
    const p = new URLSearchParams();
    if (convertError) p.set("convert_error", convertError);
    if (dupErr) p.set("dup_err", dupErr);
    const qs = p.toString();
    redirect(qs ? `/admin/inquiries/${id}?${qs}` : `/admin/inquiries/${id}`);
  }
  const activeTab = canonicalizeTab(tabRaw);
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
      event_date,
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
      booked_at,
      priority
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !inquiry) notFound();

  const storedEngineV2 = Boolean((inquiry as { uses_new_engine?: boolean }).uses_new_engine);
  if (!storedEngineV2) {
    warnLegacyInquiryV2Render(inquiry.id);
  }
  const engineV2 = true;

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
        ? supabase.from("profiles").select("id, display_name, avatar_url").eq("id", inquiry.client_user_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("talent_profiles").select("id, profile_code, display_name").is("deleted_at", null).order("profile_code", { ascending: true }).limit(500),
    ]);

  const nBookings = (bookings ?? []).length;

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
    sent_at: string | null;
    accepted_at: string | null;
    created_at: string;
    updated_at: string;
  } | null = null;
  let v2OfferLines: OfferLineDraft[] = [];
  let v2Approvals: { id: string; status: string; participant_id: string; offer_id: string | null }[] = [];
  let v2PrivateMessages: {
    id: string;
    thread_type: "private" | "group";
    body: string;
    created_at: string;
    sender_user_id: string | null;
    sender_name: string | null;
    sender_avatar_url: string | null;
    metadata: Record<string, unknown>;
  }[] = [];
  let v2GroupMessages: typeof v2PrivateMessages = [];

  if (engineV2) {
    const [{ data: msgsPrivate }, { data: msgsGroup }] = await Promise.all([
      supabase
        .from("inquiry_messages")
        .select("id, thread_type, body, created_at, sender_user_id, metadata")
        .eq("inquiry_id", id)
        .eq("thread_type", "private")
        .order("created_at", { ascending: true })
        .limit(200),
      supabase
        .from("inquiry_messages")
        .select("id, thread_type, body, created_at, sender_user_id, metadata")
        .eq("inquiry_id", id)
        .eq("thread_type", "group")
        .order("created_at", { ascending: true })
        .limit(200),
    ]);
    const rawPrivate = (msgsPrivate ?? []) as typeof v2PrivateMessages;
    const rawGroup = (msgsGroup ?? []) as typeof v2GroupMessages;

    // Enrich messages with sender display info (name + avatar)
    const senderIds = [
      ...new Set([...rawPrivate, ...rawGroup].map((m) => m.sender_user_id).filter((id): id is string => Boolean(id))),
    ];
    const senderProfileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
    if (senderIds.length > 0) {
      const { data: senderProfiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", senderIds);
      for (const p of senderProfiles ?? []) {
        senderProfileMap.set(p.id as string, {
          display_name: (p.display_name as string | null) ?? null,
          avatar_url: (p.avatar_url as string | null) ?? null,
        });
      }
    }
    const enrichMsg = (m: (typeof rawPrivate)[number]) => ({
      ...m,
      sender_name: m.sender_user_id ? (senderProfileMap.get(m.sender_user_id)?.display_name ?? null) : null,
      sender_avatar_url: m.sender_user_id ? (senderProfileMap.get(m.sender_user_id)?.avatar_url ?? null) : null,
    });
    v2PrivateMessages = rawPrivate.map(enrichMsg);
    v2GroupMessages = rawGroup.map(enrichMsg);

    const cid = (inquiry as { current_offer_id?: string | null }).current_offer_id;
    if (cid) {
      const [{ data: offer }, { data: lines }, { data: approvals }] = await Promise.all([
        supabase
          .from("inquiry_offers")
          .select(
            "id, version, status, total_client_price, coordinator_fee, currency_code, notes, sent_at, accepted_at, created_at, updated_at",
          )
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
          sent_at: (offer as { sent_at?: string | null }).sent_at ?? null,
          accepted_at: (offer as { accepted_at?: string | null }).accepted_at ?? null,
          created_at: String((offer as { created_at?: string }).created_at ?? new Date().toISOString()),
          updated_at: String((offer as { updated_at?: string }).updated_at ?? new Date().toISOString()),
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
        status: r.status,
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
          status: "active" as const,
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

  const { data: auth } = await supabase.auth.getUser();
  const viewerId = auth.user?.id ?? "";
  let viewerAppRole: string | null = null;
  if (viewerId) {
    const { data: vp } = await supabase.from("profiles").select("app_role").eq("id", viewerId).maybeSingle();
    viewerAppRole = (vp?.app_role as string | null) ?? null;
  }

  const wsStatus = normalizeWorkspaceStatus(String(inquiry.status));
  const inquiryAny = inquiry as Record<string, unknown>;
  const workspaceInquiry: InquiryWorkspaceInquiry = {
    id: inquiry.id,
    status: wsStatus,
    rawStatus: String(inquiry.status),
    version: Number((inquiry as { version?: number }).version ?? 1),
    contact_name: inquiry.contact_name,
    contact_email: inquiry.contact_email,
    contact_phone: inquiry.contact_phone,
    company: inquiry.company,
    event_location: inquiry.event_location,
    event_date: (inquiryAny.event_date as string | null | undefined) ?? null,
    message: inquiry.message,
    raw_ai_query: inquiry.raw_ai_query,
    source_channel: inquiry.source_channel ?? null,
    staff_notes: inquiry.staff_notes ?? null,
    assigned_staff_id: inquiry.assigned_staff_id,
    coordinator_id: (inquiry as { coordinator_id?: string | null }).coordinator_id ?? null,
    next_action_by: (inquiry as { next_action_by?: string | null }).next_action_by ?? null,
    current_offer_id: (inquiry as { current_offer_id?: string | null }).current_offer_id ?? null,
    booked_at: (inquiry as { booked_at?: string | null }).booked_at ?? null,
    uses_new_engine: engineV2,
    created_at: inquiry.created_at,
    updated_at: inquiry.updated_at,
    client_user_id: inquiry.client_user_id,
    client_account_id: inquiry.client_account_id,
    client_contact_id: inquiry.client_contact_id,
    closed_reason: inquiry.closed_reason ?? null,
    priority: (inquiryAny.priority as string | null | undefined) ?? null,
  };

  const rosterWorkspace: InquiryWorkspaceRosterEntry[] = typedInquiryTalents.map((r) => ({
    id: r.id,
    talent_profile_id: r.talent_profile_id,
    sort_order: r.sort_order,
    profile_code: r.profile_code,
    display_name: r.display_name,
    image_url: r.image_url,
    tag_label: r.tag_label,
    status: r.status,
  }));

  const offerWorkspace: InquiryWorkspaceOffer | null =
    v2Offer && engineV2
      ? {
          id: v2Offer.id,
          version: v2Offer.version,
          status: v2Offer.status as InquiryWorkspaceOffer["status"],
          total_client_price: v2Offer.total_client_price,
          coordinator_fee: v2Offer.coordinator_fee,
          currency_code: v2Offer.currency_code,
          notes: v2Offer.notes,
          sent_at: v2Offer.sent_at,
          accepted_at: v2Offer.accepted_at,
          created_at: v2Offer.created_at,
          updated_at: v2Offer.updated_at,
        }
      : null;

  const approvalsWorkspace: InquiryWorkspaceApproval[] = engineV2 ? (v2Approvals as InquiryWorkspaceApproval[]) : [];

  const allEngineMessages: InquiryWorkspaceMessage[] = engineV2
    ? [...v2PrivateMessages, ...v2GroupMessages]
    : [];

  const approvalState = resolveApprovalCompleteness(
    approvalsWorkspace,
    rosterWorkspace,
    workspaceInquiry.current_offer_id,
    inquiry.client_account_id,
  );
  const offerReady = isOfferReady({
    inquiry: workspaceInquiry,
    messages: allEngineMessages.map((m) => ({ id: m.id })),
  });

  const firstBookingId = ((bookings ?? [])[0] as { id?: string } | undefined)?.id ?? null;

  const workspaceStateInput = {
    status: wsStatus,
    effectiveRole: resolveEffectiveRole(viewerAppRole, viewerId, {
      coordinator_id: workspaceInquiry.coordinator_id,
      assigned_staff_id: workspaceInquiry.assigned_staff_id,
    }),
    userId: viewerId,
    hasMessages: allEngineMessages.length > 0,
    hasOffer: Boolean(v2Offer),
    offerStatus: (v2Offer?.status as InquiryWorkspaceOffer["status"] | null) ?? null,
    allApprovalsAccepted: approvalState.complete,
    pendingApprovalCount: approvalState.pending.length,
    isOfferReady: offerReady.ready,
    hasLinkedBooking: nBookings > 0,
    linkedBookingId: firstBookingId,
    isLocked: isWorkspaceLocked(wsStatus),
    workspaceDetailPath: `/admin/inquiries/${inquiry.id}`,
  };

  const workspacePrimaryAction = engineV2 ? getPrimaryAction(workspaceStateInput) : null;
  const workspacePermissions = engineV2 ? getWorkspacePermissions(workspaceStateInput) : null;
  const workspaceProgress = getProgressStep(wsStatus);

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

      {/* ── Hero (legacy engine) / Workspace V2 ───────────────── */}
      {engineV2 && workspacePrimaryAction && workspacePermissions ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-[11px] text-muted-foreground/70">{relativeTime(inquiry.created_at)}</span>
          <AdminCopyEntityIdButton id={inquiry.id} />
        </div>
      ) : null}

      {engineV2 && workspacePrimaryAction && workspacePermissions ? (
        <AdminInquiryWorkspaceV2
          inquiryId={inquiry.id}
          inquiryVersion={workspaceInquiry.version}
          statusLabel={inquiry.status}
          workspaceInquiry={workspaceInquiry}
          sourceChannelLabel={sourceChannelLabel}
          staffLabel={assignedStaffLabel}
          contactName={inquiry.contact_name}
          contactAvatarUrl={(platformClientProfile as { avatar_url?: string | null } | null)?.avatar_url ?? null}
          company={inquiry.company}
          contactEmail={inquiry.contact_email}
          contactPhone={inquiry.contact_phone}
          eventLocation={inquiry.event_location}
          nBookings={nBookings}
          nTalent={typedInquiryTalents.length}
          locationName={linkedAccount?.name ?? null}
          locationSummary={locationSummary}
          activeTab={activeTab}
          tabBasePath={`/admin/inquiries/${inquiry.id}`}
          isLocked={workspaceStateInput.isLocked}
          permissions={workspacePermissions}
          primaryAction={workspacePrimaryAction}
          progress={workspaceProgress}
          roster={rosterWorkspace}
          offer={offerWorkspace}
          offerLines={v2OfferLines}
          approvals={approvalsWorkspace}
          messagesPrivate={v2PrivateMessages}
          messagesGroup={v2GroupMessages}
          messagesPrivateHasOlder={v2PrivateMessages.length >= 200}
          messagesGroupHasOlder={v2GroupMessages.length >= 200}
          activityEntries={inquiryActivityEntries}
          bookings={((bookings ?? []) as unknown as BookingListRow[]).map((b) => ({
            id: b.id,
            title: b.title,
            status: b.status,
          }))}
          convertTalents={convertTalents}
          existingBookingsForConvert={existingBookingsForConvert}
          defaultBookingTitle={defaultBookingTitle}
          sendMessageAction={actionSendInquiryMessage}
          createOfferAction={actionCreateDraftOffer}
          startReviewAction={actionStartInquiryReview}
          reopenAction={actionReopenInquiry}
          lastPrivateMessageId={v2PrivateMessages.at(-1)?.id ?? null}
          lastGroupMessageId={v2GroupMessages.at(-1)?.id ?? null}
          detailsContent={
            <div className="space-y-6">
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

                {/* Talent shortlist */}
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
              </div>

              {/* Workflow & operations */}
              <SecondarySection
                title="Workflow & operations"
                description="Change status, reassign, or mark closed."
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

              {/* Linked bookings */}
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

              {/* Quick add booking */}
              <SecondarySection
                title="Quick add booking"
                description="Manual shortcut — prefer Convert to Booking for the full inquiry-to-booking flow."
                icon={CalendarRange}
                defaultOpen={false}
              >
                <NewBookingForm
                  inquiryId={inquiry.id}
                  talentOptions={convertTalents.map((r) => ({ id: r.talent_profile_id, profile_code: r.profile_code, display_name: r.display_name }))}
                />
              </SecondarySection>

              {/* Duplicate inquiry */}
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
          }
        />
      ) : (
        <div className="rounded-2xl border border-border/45 bg-card/60 px-6 py-5 shadow-sm">
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

          <h1 className="mt-3 font-display text-xl font-semibold tracking-tight text-foreground">
            {inquiry.contact_name || "Unnamed inquiry"}
          </h1>

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

          {inquiry.raw_ai_query?.trim() ? (
            <blockquote className="mt-3 border-l-2 border-[var(--impronta-gold)]/40 pl-3 text-sm italic text-muted-foreground">
              "{inquiry.raw_ai_query.trim()}"
            </blockquote>
          ) : inquiry.message?.trim() ? (
            <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{inquiry.message.trim()}</p>
          ) : null}

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
      )}

      {/* Legacy fallback: show inline sections for non-V2 inquiries */}
      {!engineV2 ? (
        <>
          {/* ── Convert to booking (legacy layout only) ─ */}
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

          {/* ── Activity (legacy — V2 uses History tab) ── */}
          <SecondarySection
            title="Activity log"
            description="Audit trail for conversions, duplicates, and link changes."
            icon={Waypoints}
            defaultOpen={false}
          >
            <CommercialActivityPanel title="Inquiry activity" description={null} entries={inquiryActivityEntries} />
          </SecondarySection>
        </>
      ) : null}

    </div>
  );
}
