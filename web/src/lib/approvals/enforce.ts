import "server-only";

import { assertRoleLimit, requestApproval } from "./requests";

type Admin = Parameters<typeof assertRoleLimit>[0];

export type EnforceRoleLimitResult =
  | { ok: true }
  | { ok: false; reason: "over_limit"; requestId: string | null }
  | { ok: false; reason: "unavailable" };

/**
 * The role limit, ENFORCED, and the approval request it raises.
 *
 * D-139: Settings > Roles & limits wrote `role_limits` and the W56 inbox
 * decided `approval_requests`, but `assertRoleLimit` had no caller and no
 * screen raised a request: a discount or a refund over the role's limit went
 * straight through, the `over_limit` sentence never showed, and the inbox
 * could only decide rows no surface created. This is the one door the
 * counter's write paths go through: the amount is judged against the actor's
 * role, and a refusal FILES the request (idempotent on its operation key) so
 * a manager finds it in the inbox instead of hearing about it.
 *
 * A caller with no membership role (a platform operator) is not limited:
 * limits are written per tenant role, and there is no row for "nobody".
 */
export async function enforceRoleLimit(
  admin: Admin,
  input: {
    tenantId: string;
    role: string | null;
    action: "discount" | "refund";
    amountCents: number;
    subjectId: string;
    requestedBy: string;
    operationKey: string;
    reason: string;
  },
): Promise<EnforceRoleLimitResult> {
  if (!input.role) return { ok: true };
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) return { ok: true };
  const verdict = await assertRoleLimit(admin, {
    tenantId: input.tenantId,
    role: input.role,
    action: input.action,
    amountCents: input.amountCents,
  });
  if (verdict.ok) return { ok: true };
  if (verdict.reason !== "over_limit") return { ok: false, reason: "unavailable" };
  const filed = await requestApproval(admin, {
    tenantId: input.tenantId,
    kind: input.action,
    subjectId: input.subjectId,
    requestedBy: input.requestedBy,
    operationKey: input.operationKey,
    reason: input.reason.slice(0, 200),
  });
  return { ok: false, reason: "over_limit", requestId: filed.ok ? filed.requestId : null };
}
