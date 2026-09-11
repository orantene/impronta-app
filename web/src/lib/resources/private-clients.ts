/**
 * P6-05 — a professional's private client list stays in her workspace.
 *
 * `customers.tenant_id` is the boundary. This command refuses a cross-workspace
 * read rather than returning an empty list that could be mistaken for "she has
 * no clients".
 */

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type PrivateClient = {
  id: string;
  displayName: string | null;
  email: string | null;
};

export async function listPrivateClients(
  admin: Admin,
  input: { tenantId: string; actorTenantId: string },
): Promise<
  | { ok: true; clients: PrivateClient[] }
  | { ok: false; reason: "cross_workspace" | "unavailable" | "invalid"; error: string }
> {
  if (!input.tenantId || !input.actorTenantId) {
    return { ok: false, reason: "invalid", error: "Missing workspace." };
  }
  if (input.actorTenantId !== input.tenantId) {
    return {
      ok: false,
      reason: "cross_workspace",
      error: "That client list belongs to another workspace.",
    };
  }
  const { data, error } = await admin
    .from("customers")
    .select("id, display_name, email")
    .eq("tenant_id", input.tenantId)
    .is("merged_into_id", null);
  if (error) {
    logServerError("resources.listPrivateClients", error);
    return { ok: false, reason: "unavailable", error: "Could not read clients." };
  }
  const rows = (data ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>;
  return {
    ok: true,
    clients: rows.map((r) => ({ id: r.id, displayName: r.display_name, email: r.email })),
  };
}
