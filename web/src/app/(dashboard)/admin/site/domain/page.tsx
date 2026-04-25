import { Globe2 } from "lucide-react";

import { ComingSoonPage } from "@/components/admin/site-control-center/coming-soon-page";

export const dynamic = "force-dynamic";

export default function AdminSiteDomainPage() {
  return (
    <ComingSoonPage
      icon={Globe2}
      title="Domain & home"
      plan="studio"
      description="Your subdomain — a single deep-linkable home for your roster."
      bullets={[
        "Reserve <yourname>.rostra.app at the Studio tier",
        "Point a custom domain when you upgrade to Agency",
        "Auto-issued SSL, edge-cached delivery, locale routing",
        "Public home shows your roster + a contact form by default",
      ]}
    />
  );
}
