import { ClientInquiryList } from "@/app/(dashboard)/client/client-inquiry-list";
import { ClientPageHeader } from "@/app/(dashboard)/client/client-page-header";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ClientDashboardLoadFallback } from "@/components/dashboard/dashboard-load-fallback";
import { loadClientDashboardData } from "@/lib/client-dashboard-data";
import { CLIENT_PAGE_STACK_WIDE } from "@/lib/dashboard-shell-classes";

export default async function ClientInquiriesPage() {
  const result = await loadClientDashboardData();
  if (!result.ok) return <ClientDashboardLoadFallback reason={result.reason} />;

  const { inquiries, eventTypeMap, agencyWhatsAppNumber } = result.data;

  return (
    <div className={CLIENT_PAGE_STACK_WIDE}>
      <ClientPageHeader
        title="Inquiries"
        subtitle="Every inquiry stays on this account with status, context, and the talent you selected."
        help={{
          title: "Inquiries",
          items: [
            "Open a row to see event details, filters, and messages you sent.",
            "Use WhatsApp draft for a pre-filled message to the agency when it’s enabled.",
          ],
        }}
      />

      <DashboardSectionCard title="Inquiry history" description={null}>
        <ClientInquiryList
          inquiries={inquiries}
          eventTypeMap={eventTypeMap}
          agencyWhatsAppNumber={agencyWhatsAppNumber}
        />
      </DashboardSectionCard>
    </div>
  );
}
