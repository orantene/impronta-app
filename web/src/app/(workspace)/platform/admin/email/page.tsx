// Platform Admin — Email console.
// Deliverability health, send log + manual retry, suppression management, and a
// diagnostic test-send. super_admin access is enforced by the admin layout
// (layout.tsx -> isPlatformAdmin -> notFound); every write action re-checks.

import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadEmailSendLog,
  loadEmailMetrics,
  loadEmailSuppressions,
  loadEmailDomainStatus,
  serverNowMs,
} from "./email-data";
import { EmailConsoleClient } from "./EmailConsoleClient";

export const dynamic = "force-dynamic";

export default async function EmailConsolePage() {
  const [sendLog, metrics, suppressions, domain, session] = await Promise.all([
    loadEmailSendLog({ limit: 300 }),
    loadEmailMetrics(),
    loadEmailSuppressions(),
    loadEmailDomainStatus(),
    getCachedActorSession(),
  ]);

  return (
    <EmailConsoleClient
      sendLog={sendLog}
      metrics={metrics}
      suppressions={suppressions}
      domain={domain}
      adminEmail={session.user?.email ?? ""}
      nowMs={serverNowMs()}
    />
  );
}
