/**
 * Talent promo notifications (design doc L10). Pure planner: promo state in,
 * notification rows out. The cron route does the I/O. Idempotency: each row's
 * originEventId is deterministic, and emitNotification is unique on
 * (origin_event_id, user_id), so a re-run never double-sends.
 */
import { money, type Lang } from "../results/copy";

export type PromoNotifyKind = "two_left" | "sold_out" | "expires_tomorrow" | "spot_back";

export type PromoNotifyInput = {
  promoId: string;
  tenantId: string;
  name: string;
  maxUses: number | null;
  /** Confirmed + live holds, the way limits count. */
  used: number;
  /** Instant the promo ends, if it has an end. */
  endsAtIso: string | null;
  /** Latest time a held / confirmed spot was released back (void, expired hold). */
  lastSpotReleasedAtIso?: string | null;
  /** Result for the sold-out card. */
  result?: { bookings: number; earnedCents: number; currency: string } | null;
  recipientUserIds: readonly string[];
  isLive: boolean;
};

export type PlannedNotification = {
  userId: string;
  tenantId: string;
  kind: "booking";
  title: string;
  body?: string;
  originEventId: string;
  originKind: string;
  targetPayload: Record<string, unknown>;
};

const H = 3_600_000;
export const BUNDLE_AT = 3;
export const SPOT_BACK_WINDOW_HOURS = 2;
export const EXPIRES_WITHIN_HOURS = 24;

function text(kind: PromoNotifyKind, i: PromoNotifyInput, lang: Lang): { title: string; body?: string } {
  const es = lang === "es";
  switch (kind) {
    case "two_left":
      return { title: es ? `Quedan 2 lugares en ${i.name}` : `2 spots left in ${i.name}` };
    case "sold_out": {
      const r = i.result;
      const body = r && r.bookings > 0
        ? es
          ? `${r.bookings} ${r.bookings === 1 ? "cita" : "citas"}, ${money(r.earnedCents, r.currency, lang)} ganados`
          : `${r.bookings} ${r.bookings === 1 ? "booking" : "bookings"}, ${money(r.earnedCents, r.currency, lang)} earned`
        : undefined;
      return { title: es ? `¡Agotada! ${i.name}` : `Sold out! ${i.name}`, body };
    }
    case "expires_tomorrow":
      return {
        title: es ? `${i.name} termina mañana` : `${i.name} ends tomorrow`,
        body: es ? "¿Compartirla otra vez?" : "Share it again?",
      };
    case "spot_back":
      return { title: es ? `Se liberó un lugar en ${i.name}` : `A spot opened up in ${i.name}` };
  }
}

/** Which events apply to one promo right now. */
export function promoEvents(i: PromoNotifyInput, now: Date): { kind: PromoNotifyKind; originEventId: string }[] {
  const out: { kind: PromoNotifyKind; originEventId: string }[] = [];
  const max = i.maxUses;
  if (!max || max <= 0) return out;
  if (i.used >= max) {
    out.push({ kind: "sold_out", originEventId: `promo:${i.promoId}:sold_out:${max}` });
    return out;
  }
  if (!i.isLive) return out;
  if (max >= 5 && max - i.used === 2) out.push({ kind: "two_left", originEventId: `promo:${i.promoId}:two_left` });
  if (i.endsAtIso) {
    const left = new Date(i.endsAtIso).getTime() - now.getTime();
    if (left > 0 && left <= EXPIRES_WITHIN_HOURS * H && i.used / max < 0.8) {
      out.push({ kind: "expires_tomorrow", originEventId: `promo:${i.promoId}:expires:${i.endsAtIso}` });
    }
  }
  if (i.lastSpotReleasedAtIso && max - i.used === 1) {
    const age = now.getTime() - new Date(i.lastSpotReleasedAtIso).getTime();
    if (age >= 0 && age <= SPOT_BACK_WINDOW_HOURS * H) {
      out.push({ kind: "spot_back", originEventId: `promo:${i.promoId}:spot_back:${i.lastSpotReleasedAtIso}` });
    }
  }
  return out;
}

function hash(s: string): string {
  let h = 5381;
  for (let k = 0; k < s.length; k++) h = ((h << 5) + h + s.charCodeAt(k)) >>> 0;
  return h.toString(36);
}

/**
 * All notifications for one run. A user with 3+ planned rows gets ONE bundled
 * row instead; its id hashes the member ids, so the same set stays deduped.
 */
export function planPromoNotifications(inputs: readonly PromoNotifyInput[], now: Date, lang: Lang = "es"): PlannedNotification[] {
  const perUser = new Map<string, PlannedNotification[]>();
  for (const i of inputs) {
    for (const ev of promoEvents(i, now)) {
      const t = text(ev.kind, i, lang);
      for (const userId of i.recipientUserIds) {
        const row: PlannedNotification = {
          userId,
          tenantId: i.tenantId,
          kind: "booking",
          title: t.title,
          body: t.body,
          originEventId: ev.originEventId,
          originKind: `promo_${ev.kind}`,
          targetPayload: { kind: "promo", promoId: i.promoId, event: ev.kind },
        };
        perUser.set(userId, [...(perUser.get(userId) ?? []), row]);
      }
    }
  }
  const out: PlannedNotification[] = [];
  for (const [userId, rows] of perUser) {
    if (rows.length < BUNDLE_AT) {
      out.push(...rows);
      continue;
    }
    const ids = rows.map((r) => r.originEventId).sort();
    out.push({
      userId,
      tenantId: rows[0]!.tenantId,
      kind: "booking",
      title: lang === "es" ? `${rows.length} novedades en tus promos` : `${rows.length} updates on your promos`,
      body: rows.map((r) => r.title).join(" · "),
      originEventId: `promo-bundle:${hash(ids.join("|"))}`,
      originKind: "promo_bundle",
      targetPayload: { kind: "promo", bundled: ids },
    });
  }
  return out;
}

/**
 * Who hears about a promo. A talent promo (has an owner) goes to that
 * talent's user ONLY: on the shared hub tenant the tenant's owners/admins are
 * platform staff, and the other ~300 talents must never hear about it. An
 * agency-wide promo (no owner) goes to the tenant's owners/admins.
 */
export function promoRecipientUserIds(
  promo: { tenant_id: string; talent_profile_id: string | null },
  tenantAdmins: ReadonlyMap<string, readonly string[]>,
  talentUsers: ReadonlyMap<string, string>,
): string[] {
  if (promo.talent_profile_id) {
    const u = talentUsers.get(promo.talent_profile_id);
    return u ? [u] : [];
  }
  return [...(tenantAdmins.get(promo.tenant_id) ?? [])];
}
