// Platform Admin — Audit Log Page
// Read-only view of platform_audit_log table with filters.

import { loadPlatformAuditLog } from "../../platform-data";
import { AuditLogClient } from "./AuditLogClient";

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const rows = await loadPlatformAuditLog({ limit: 200 });

  return <AuditLogClient rows={rows} />;
}
