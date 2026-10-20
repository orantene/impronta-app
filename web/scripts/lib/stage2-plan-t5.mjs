/**
 * T5: story-10 fixtures. Push 2a builds the workspace, the instructor login, the studio venue and the weekly paid yoga class.
 * The drink deal, the tour with an early bird and the beach-club bed with a minimum spend follow in push 2b.
 */
import { email, insert, membershipOp, s2Id, userOps, workspaceOps } from "./stage2-ops.mjs";
import { planClass } from "./stage2-plan-events.mjs";

export const T5_SLUG = "s2-experiencias";
export const T5_WS = s2Id("workspace:t5");

export function planT5(at) {
  const fx = "T5";
  const ws = T5_WS;
  const w = workspaceOps(fx, "t5", {
    slug: T5_SLUG, name: "Experiencias Aurora", tagline: "Yoga, tours y club de playa", businessType: "yoga-studio", ownerKey: "t5-owner", at,
  });
  const venue = s2Id("venue:t5-estudio");
  return [
    ...userOps(fx, "t5-owner", { email: email("t5-owner"), name: "Beatriz Aurora" }),
    ...userOps(fx, "t5-instructor", { email: email("t5-instructor"), name: "Camila Instructora" }),
    ...w.ops,
    membershipOp(fx, "t5-instructor", ws, "t5-instructor", { role: "editor" }, at),
    insert(fx, "public.venues", "venue:t5-estudio", { id: venue, tenant_id: ws, name: "Estudio Aurora", slug: "s2-experiencias-estudio", city: "Cancún", country_code: "MX", timezone: "America/Cancun", is_default: true, status: "active" }),
    ...planClass(ws, venue, at),
  ];
}
