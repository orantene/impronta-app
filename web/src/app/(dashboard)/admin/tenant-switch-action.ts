// Phase 4 migration shim — canonical lives at @/lib/saas/tenant-switch-action.
// This file exists only so any remaining internal (dashboard)/ imports keep
// working until the rest of the legacy route group is deleted.
export { switchActiveTenant } from "@/lib/saas/tenant-switch-action";
