// Phase 4 migration shim — canonical lives at @/lib/server-actions/admin-site-pages.
// This file exists only so any remaining internal (dashboard)/ imports keep
// working until the rest of the legacy route group is deleted.
export * from "@/lib/server-actions/admin-site-pages";
