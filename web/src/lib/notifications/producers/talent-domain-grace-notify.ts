import "server-only";

import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";

/**
 * WAVE 1B D6 — in-app notices when a talent loses Web Office while holding a
 * custom domain. Email / renewal charging is D5; this producer stays in_app.
 */
export function notifyTalentDomainPlanGrace(params: {
  kind: "restore" | "disposition" | "detached";
  talentProfileId: string;
  graceEndsAt: string | null;
  domain: string | null;
}): void {
  const type =
    params.kind === "restore"
      ? "talent.domain.plan_grace_started"
      : params.kind === "disposition"
        ? "talent.domain.disposition_offer"
        : "talent.domain.detached";

  const eventId = `${type}:${params.talentProfileId}:${params.domain ?? "any"}:${params.graceEndsAt ?? "none"}`;

  void dispatchEventNotifications({
    type,
    tenantId: null,
    eventId,
    payload: {
      talentProfileId: params.talentProfileId,
      graceEndsAt: params.graceEndsAt,
      domain: params.domain,
    },
  }).catch((err) => {
    logServerError("notifyTalentDomainPlanGrace", err);
  });
}
