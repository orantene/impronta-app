import { Key } from "lucide-react";

import { ComingSoonPage } from "@/components/admin/site-control-center/coming-soon-page";

export const dynamic = "force-dynamic";

export default function AdminSiteApiKeysPage() {
  return (
    <ComingSoonPage
      icon={Key}
      title="API keys"
      plan="studio"
      description="Read-only JSON for your roster, inquiries, and bookings."
      bullets={[
        "Per-key scopes: roster, inquiries, bookings, all-of-the-above",
        "Rotate, expire, or revoke any key from this surface",
        "Rate-limit visibility per key — no surprises in production",
        "Webhook destinations for inquiry-created and booking-updated events",
      ]}
    />
  );
}
