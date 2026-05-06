// Phase 3.12 / Messages — workspace Messages page (server component).
//
// Loads the inbox list eagerly, plus per-inquiry detail data for the
// selected inquiry (lineup, current offer + history, attachments, payment
// transactions, roster picker for AddTalentPicker drawer). MessagesShell
// renders client-side and re-fetches via realtime + router.refresh().

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadInquiriesForMessages } from "../../_data-bridge";
import {
  loadInquiryLineup,
  loadInquiryCurrentOffer,
  loadInquiryOfferHistory,
  loadInquiryAttachments,
  loadInquiryBookingTransactions,
  loadAddTalentPickerRows,
} from "./messages-data";
import MessagesShell from "./MessagesShell";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;
type PageSearchParams = Promise<{ inquiry?: string }>;

const C = {
  ink:    "#0B0B0D",
  accent: "#0F4F3E",
} as const;
const FONT = '"Inter", system-ui, sans-serif';

export default async function WorkspaceMessagesPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearchParams;
}) {
  const { tenantSlug } = await params;
  const { inquiry: initialInquiryId } = await searchParams;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const inquiries = await loadInquiriesForMessages(scope.tenantId);

  // Resolve which inquiry to show in the right pane on first paint.
  const fallbackId = inquiries.find((i) => !i.archived)?.id ?? null;
  const targetId =
    initialInquiryId && inquiries.some((i) => i.id === initialInquiryId)
      ? initialInquiryId
      : fallbackId;

  // Eagerly load per-inquiry detail data so the right pane has zero round
  // trips on first paint. When the user switches inquiries we refresh via
  // navigation (?inquiry=) which re-runs this server component.
  const detail = targetId
    ? await Promise.all([
        loadInquiryLineup(scope.tenantId, targetId),
        loadInquiryCurrentOffer(scope.tenantId, targetId),
        loadInquiryOfferHistory(scope.tenantId, targetId),
        loadInquiryAttachments(scope.tenantId, targetId),
        loadInquiryBookingTransactions(scope.tenantId, targetId),
        loadAddTalentPickerRows(scope.tenantId, targetId),
      ])
    : null;

  const detailBundle = detail
    ? {
        inquiryId: targetId!,
        lineup:        detail[0],
        currentOffer:  detail[1],
        offerHistory:  detail[2],
        attachments:   detail[3],
        transactions:  detail[4],
        rosterPicker:  detail[5],
      }
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONT }}>
      {/* Page header */}
      <div>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: C.accent,
            marginBottom: 4,
          }}
        >
          {scope.membership.display_name}
        </div>
        <h1
          style={{
            fontFamily: FONT,
            fontSize: 26,
            fontWeight: 700,
            color: C.ink,
            margin: 0,
            letterSpacing: -0.5,
            lineHeight: 1.1,
          }}
        >
          Messages
        </h1>
      </div>

      <MessagesShell
        inquiries={inquiries}
        tenantSlug={tenantSlug}
        initialInquiryId={targetId}
        detailBundle={detailBundle}
      />
    </div>
  );
}
