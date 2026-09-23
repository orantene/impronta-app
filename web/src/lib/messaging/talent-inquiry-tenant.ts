/**
 * Who owns a guest inquiry that starts on the talent's own site
 * (`<name>.tulala.digital`). Pure: the server loader fetches roster rows and
 * the platform hub, then this function decides. Nothing here reads a request.
 *
 * On her own site the hub is the seller when she is independent, when the
 * only agency rows are pending or hidden, and when more than one agency
 * would otherwise claim her. Exactly one active, publicly selling agency
 * is the seller for that surface.
 */

export type TalentRosterFact = {
  readonly tenantId: string;
  readonly status: string;
  /** `roster_only` is on the roster but not selling on a public surface. */
  readonly agencyVisibility: string;
  readonly talentSiteHidden: boolean;
};

export type TalentInquiryTenantReason =
  | "independent"
  | "single_agency"
  | "several_agencies"
  | "pending_roster"
  | "hidden_roster";

export type TalentInquiryTenantPick =
  | {
      readonly ok: true;
      readonly tenantId: string;
      readonly seller: "hub" | "agency";
      readonly reason: TalentInquiryTenantReason;
    }
  | { readonly ok: false; readonly reason: "no_hub" };

const SELLING_VISIBILITY = new Set(["site_visible", "featured"]);

function isSellingAgency(row: TalentRosterFact, hubTenantId: string): boolean {
  if (row.tenantId === hubTenantId) return false;
  if (row.status !== "active") return false;
  if (row.talentSiteHidden) return false;
  return SELLING_VISIBILITY.has(row.agencyVisibility);
}

/**
 * Pick the tenant that owns inquiries started on her own site.
 * `hubTenantId` null means the platform hub could not be resolved: fail
 * closed (`no_hub`) rather than guess an agency.
 */
export function pickTalentSiteInquiryTenant(input: {
  hubTenantId: string | null;
  rosters: readonly TalentRosterFact[];
}): TalentInquiryTenantPick {
  if (!input.hubTenantId) return { ok: false, reason: "no_hub" };
  const hubTenantId = input.hubTenantId;
  const sellers = [
    ...new Set(
      input.rosters.filter((row) => isSellingAgency(row, hubTenantId)).map((row) => row.tenantId),
    ),
  ];
  if (sellers.length === 1) {
    return { ok: true, tenantId: sellers[0]!, seller: "agency", reason: "single_agency" };
  }
  if (sellers.length > 1) {
    return { ok: true, tenantId: hubTenantId, seller: "hub", reason: "several_agencies" };
  }

  const nonHub = input.rosters.filter((row) => row.tenantId !== hubTenantId);
  const pending = nonHub.some((row) => row.status === "pending");
  const hidden = nonHub.some(
    (row) =>
      row.status === "active" &&
      (row.talentSiteHidden || !SELLING_VISIBILITY.has(row.agencyVisibility)),
  );
  const reason: TalentInquiryTenantReason = hidden
    ? "hidden_roster"
    : pending
      ? "pending_roster"
      : "independent";
  return { ok: true, tenantId: hubTenantId, seller: "hub", reason };
}
