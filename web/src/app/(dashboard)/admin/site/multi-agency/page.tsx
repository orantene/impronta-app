import { Code2 } from "lucide-react";

import { ComingSoonPage } from "@/components/admin/site-control-center/coming-soon-page";

export const dynamic = "force-dynamic";

export default function AdminSiteMultiAgencyPage() {
  return (
    <ComingSoonPage
      icon={Code2}
      title="Multi-agency manager"
      plan="network"
      description="Run multiple agencies from a single login."
      bullets={[
        "One sidebar, swap workspace from the top bar — no re-auth",
        "Per-agency isolated data, billing, and branding (RLS-enforced)",
        "Shared-talent view: see who's on more than one of your rosters",
        "Per-manager roles per agency — staff need not be all-or-nothing",
      ]}
    />
  );
}
