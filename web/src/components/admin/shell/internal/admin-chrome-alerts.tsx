import { OfflineBanner } from "./primitives";
import { StaleDeploymentBanner } from "@/components/admin/stale-deployment-banner";

/** Connection-loss and stale-deploy banners share the top of the admin chrome. */
export function AdminChromeAlerts() {
  return (
    <>
      <OfflineBanner />
      <StaleDeploymentBanner />
    </>
  );
}
