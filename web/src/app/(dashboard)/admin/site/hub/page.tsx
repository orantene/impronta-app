import { Network } from "lucide-react";

import { ComingSoonPage } from "@/components/admin/site-control-center/coming-soon-page";

export const dynamic = "force-dynamic";

export default function AdminSiteHubPage() {
  return (
    <ComingSoonPage
      icon={Network}
      title="Hub publishing"
      plan="network"
      description="Promote talent into the cross-agency discovery hub."
      bullets={[
        "Per-talent opt-in: only the people you flag appear on the hub",
        "Hub directs interested clients back to your inquiries — never bypasses you",
        "Co-branded result cards: your agency name + your domain stay visible",
        "Performance reports per talent: hub impressions vs. inquiries returned",
      ]}
    />
  );
}
