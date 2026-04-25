import Link from "next/link";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";

function norm(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

export function BookingPortalVisibilityExplainer({
  clientVisibleAt,
  sourceInquiryId,
  clientUserId,
  contactHasPortalUser,
}: {
  clientVisibleAt: string | null;
  sourceInquiryId: string | null;
  clientUserId: string | null;
  contactHasPortalUser: boolean;
}) {
  const portalTimestampSet = clientVisibleAt != null && String(clientVisibleAt).length > 0;
  const inquiryPath = sourceInquiryId != null;

  return (
    <DashboardSectionCard
      title="Client portal visibility"
      description="Who can see this booking under /client/bookings (RLS-enforced)."
      titleClassName={ADMIN_SECTION_TITLE_CLASS}
    >
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Inquiry path:</span>{" "}
          {inquiryPath ? (
            <>
              This booking is linked to a source inquiry. The logged-in client who owns that inquiry can open it in
              their portal{" "}
              <span className="text-foreground/90">
                even if <code className="rounded bg-muted px-1 text-xs">client_visible_at</code> is empty
              </span>
              .
            </>
          ) : (
            <>No source inquiry — there is no “same request” shortcut for a guest or anonymous lead.</>
          )}
        </p>
        <p>
          <span className="font-medium text-foreground">Account / contact path:</span> When{" "}
          <code className="rounded bg-muted px-1 text-xs">client_visible_at</code> is set, the booking may appear for
          the linked platform client (<code className="rounded bg-muted px-1 text-xs">client_user_id</code>
          {clientUserId ? " is set on this row" : " is not set"}) or for a contact who has a linked login
          {contactHasPortalUser ? " (this contact has a portal user)" : " (this contact has no portal user yet)"}.
        </p>
        <p>
          <span className="font-medium text-foreground">Manual internal jobs:</span> Leave both inquiry link and portal
          timestamp unset (and no client user/contact login) to keep the job staff-only in the client workspace.
        </p>
        <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-xs">
          <p className="font-medium text-foreground">Current flags</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>
              <code className="rounded bg-muted px-1">client_visible_at</code>:{" "}
              {portalTimestampSet ? (
                <span className="text-foreground">{new Date(clientVisibleAt!).toLocaleString()}</span>
              ) : (
                <span>not set</span>
              )}
            </li>
            <li>
              Source inquiry: {inquiryPath ? <span className="text-foreground">linked</span> : <span>none</span>}
            </li>
          </ul>
        </div>
      </div>
    </DashboardSectionCard>
  );
}

export function BookingSnapshotDriftCallout({
  accountLinkedName,
  accountSnapshotName,
  contactLinkedName,
  contactSnapshotName,
  contactSnapshotEmail,
  contactLinkedEmail,
}: {
  accountLinkedName: string | null;
  accountSnapshotName: string | null;
  contactLinkedName: string | null;
  contactSnapshotName: string | null;
  contactSnapshotEmail: string | null;
  contactLinkedEmail: string | null;
}) {
  const accountDrift =
    accountLinkedName &&
    accountSnapshotName &&
    norm(accountLinkedName) !== norm(accountSnapshotName);
  const nameDrift =
    contactLinkedName &&
    contactSnapshotName &&
    norm(contactLinkedName) !== norm(contactSnapshotName);
  const emailDrift =
    contactLinkedEmail &&
    contactSnapshotEmail &&
    norm(contactLinkedEmail) !== norm(contactSnapshotEmail);

  if (!accountDrift && !nameDrift && !emailDrift) return null;

  return (
    <div
      role="status"
      className="rounded-lg border border-foreground/35 border-l-[3px] border-l-foreground bg-foreground/[0.05] px-3 py-2 text-sm text-foreground"
    >
      <p className="font-medium text-foreground">Snapshot mismatch</p>
      <p className="mt-1 text-muted-foreground">
        Linked CRM records differ from text stored on this booking. Links are authoritative for IDs; snapshots are a
        point-in-time copy. Use refresh checkboxes on save to align, or leave as-is for audit.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
        {accountDrift ? (
          <li>
            Account name: snapshot “{accountSnapshotName}” vs linked “{accountLinkedName}”.
          </li>
        ) : null}
        {nameDrift ? (
          <li>
            Contact name: snapshot “{contactSnapshotName}” vs linked “{contactLinkedName}”.
          </li>
        ) : null}
        {emailDrift ? (
          <li>
            Contact email: snapshot “{contactSnapshotEmail}” vs linked “{contactLinkedEmail}”.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export function InquirySnapshotDriftCallout({
  linkedAccountName,
  inquiryCompany,
  linkedContactName,
  inquiryContactName,
}: {
  linkedAccountName: string | null;
  inquiryCompany: string | null;
  linkedContactName: string | null;
  inquiryContactName: string | null;
}) {
  const acc =
    linkedAccountName &&
    inquiryCompany &&
    norm(linkedAccountName) !== norm(inquiryCompany);
  const con =
    linkedContactName &&
    inquiryContactName &&
    norm(linkedContactName) !== norm(inquiryContactName);

  if (!acc && !con) return null;

  return (
    <div
      role="status"
      className="rounded-lg border border-foreground/35 border-l-[3px] border-l-foreground bg-foreground/[0.05] px-3 py-2 text-sm text-foreground"
    >
      <p className="font-medium text-foreground">Snapshot mismatch</p>
      <p className="mt-1 text-muted-foreground">
        Linked account/contact do not match the inquiry’s stored company / contact name. Refresh snapshots on save if
        the CRM record is the source of truth.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
        {acc ? (
          <li>
            Company: inquiry “{inquiryCompany}” vs linked account “{linkedAccountName}”.
          </li>
        ) : null}
        {con ? (
          <li>
            Contact: inquiry “{inquiryContactName}” vs linked contact “{linkedContactName}”.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export function InquiryConversionStatusPanel({
  inquiryStatus,
  bookings,
}: {
  inquiryStatus: string;
  bookings: { id: string; title: string; status: string }[];
}) {
  const hasBookings = bookings.length > 0;
  const convertedFlag = inquiryStatus === "converted";

  return (
    <DashboardSectionCard
      title="Conversion to booking"
      description="Track how this lead became a commercial job."
      titleClassName={ADMIN_SECTION_TITLE_CLASS}
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              hasBookings
                ? "rounded-full border border-foreground/55 bg-foreground/[0.08] px-2.5 py-0.5 text-xs font-medium text-foreground"
                : "rounded-full border border-border/50 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
            }
          >
            {hasBookings ? `${bookings.length} linked booking${bookings.length === 1 ? "" : "s"}` : "No booking linked yet"}
          </span>
          {convertedFlag ? (
            <span className="rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5 text-xs text-muted-foreground">
              Inquiry marked converted
            </span>
          ) : null}
        </div>
        {!hasBookings ? (
          <p className="text-muted-foreground">
            Use <span className="font-medium text-foreground">Convert to booking</span> below to create a job or attach
            talent to an existing booking tied to this inquiry.
          </p>
        ) : (
          <ul className="space-y-2">
            {bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/40 bg-muted/15 px-3 py-2">
                <Link
                  href={`/admin/bookings/${b.id}`}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  scroll={false}
                >
                  {b.title}
                </Link>
                <AdminCommercialStatusBadge kind="booking" status={b.status} className="text-[11px]" />
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Inquiry stays the intake record; bookings are revenue objects. Activity for conversions appears in the panels
          below once staff act.
        </p>
      </div>
    </DashboardSectionCard>
  );
}
