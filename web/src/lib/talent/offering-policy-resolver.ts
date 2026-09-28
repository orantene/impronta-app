/**
 * offering-policy-resolver.ts — THE one answer to "what rules does this
 * offering actually book under". PURE, no I/O.
 *
 * WHY. The services editor (`EditorScreen.tsx`) shows "Uses your default"
 * for a deposit or a cancellation window the talent set once in Defaults
 * (`talent_profiles.selling_defaults`), but checkout read only the
 * `talent_offerings` row. A talent who set a 30% default deposit saw
 * "Uses your default: 30%" and every guest was charged in full. This module
 * is the chain both the editor's promise and the server's charge now follow.
 *
 * PRECEDENCE (mirrors the editor exactly):
 *   offering explicit value → talent default → platform default.
 *
 * "Explicit" is decided the way the editor decides it: a column / attribute
 * that is null or absent means "use my default"
 * (`item.depositPct ?? defaults.depositPct`,
 *  `item.cancellationHours ?? defaults.cancelHours`,
 *  `attr(item, "bufferBeforeMin", defaults.bufferBeforeMin)` where attr treats
 *  undefined AND null as absent). The talent default is read the way
 * `loadSellingDefaults` reads it, including its platform fallbacks
 * (cancelHours 24, rescheduleHours 24).
 *
 * `sellingDefaults` is the raw `talent_profiles.selling_defaults` blob (the
 * column is NOT NULL, default `{}`), or null when the offering has no talent
 * owner.
 *
 * ONE EXCEPTION, deliberate: `reserve_mode = 'free'` is an explicit owner
 * choice to take no money at booking, so a default deposit never overrides it.
 */

import {
  resolveEffectiveBookingMode,
  resolveEffectiveMinNoticeMin,
} from "@/lib/scheduling/instant-book-gates";
import type { OfferingBookingMode, OfferingReserveMode } from "@/lib/talent/offerings-types";
import {
  applySwitchesToMode,
  instantReadiness,
  readinessGaps,
  takesMoneyOnline,
  type AcceptingSwitches,
} from "@/lib/talent/accepting-readiness";

/** What the platform applies when neither the offering nor the talent chose. */
export const PLATFORM_POLICY_DEFAULTS = {
  /** Same value `loadSellingDefaults` shows the talent when unset. */
  cancellationHours: 24,
  rescheduleHours: 24,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
} as const;

/** Same clamp the slot engine applies (`applySellingTimeToHours`, `parseBookingHours`). */
export const BUFFER_MAX_MIN = 240;

export type OfferingPolicyInput = {
  reserveMode: OfferingReserveMode | string | null | undefined;
  depositPct: number | null | undefined;
  cancellationHours: number | null | undefined;
  /** `talent_offerings.attributes` — carries per-item buffers. */
  attributes?: unknown;
};

/** The `talent_booking_hours` row's own values, the fallback under the defaults. */
export type HoursRowPolicy = {
  bufferBeforeMin?: number | null;
  bufferAfterMin?: number | null;
  minNoticeMin?: number | null;
} | null;

export type EffectiveOfferingPolicy = {
  reserveMode: OfferingReserveMode;
  /** 1..99 when `reserveMode === "deposit"` and a percentage is known, else null. */
  depositPct: number | null;
  /** Null only for an offering with no talent owner and no own value (flexible). */
  cancellationHours: number | null;
  rescheduleHours: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  /** Where each value came from, for tests and audit. */
  source: {
    depositPct: "offering" | "default" | "none";
    cancellationHours: "offering" | "default" | "platform" | "none";
  };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function intIn(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  return n < min || n > max ? null : n;
}

function validPct(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v >= 100) return null;
  return Math.round(v);
}

function nonNegInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v);
}

function normalizeReserveMode(v: unknown): OfferingReserveMode {
  return v === "deposit" || v === "free" ? v : "full";
}

export function resolveOfferingPolicy(
  offering: OfferingPolicyInput,
  sellingDefaults: unknown,
  hoursRow: HoursRowPolicy = null,
): EffectiveOfferingPolicy {
  const d = isRecord(sellingDefaults) ? sellingDefaults : null;
  const attrs = isRecord(offering.attributes) ? offering.attributes : null;
  const baseMode = normalizeReserveMode(offering.reserveMode);

  // ── Deposit. Editor: item.depositPct ?? defaults.depositPct.
  const ownPct = validPct(offering.depositPct);
  const defaultPct = d ? validPct(d.depositPct) : null;
  let reserveMode: OfferingReserveMode = baseMode;
  let depositPct: number | null = null;
  let depositSource: EffectiveOfferingPolicy["source"]["depositPct"] = "none";
  if (baseMode !== "free") {
    if (ownPct != null) {
      reserveMode = "deposit";
      depositPct = ownPct;
      depositSource = "offering";
    } else if (defaultPct != null) {
      reserveMode = "deposit";
      depositPct = defaultPct;
      depositSource = "default";
    }
  }

  // ── Cancellation. Editor: item.cancellationHours ?? defaults.cancelHours,
  //    and loadSellingDefaults fills an unset default with 24.
  const ownCancel = nonNegInt(offering.cancellationHours);
  const defaultCancel = d ? nonNegInt(d.cancelHours) : null;
  //    The platform 24 h applies only to a talent-owned offering (defaults
  //    blob present, `{}` included): that is the value the editor shows. An
  //    agency-owned offering (no talent, `sellingDefaults` null) keeps its
  //    row's own value or stays flexible, exactly as before.
  const cancellationHours =
    ownCancel ?? defaultCancel ?? (d ? PLATFORM_POLICY_DEFAULTS.cancellationHours : null);
  const cancelSource: EffectiveOfferingPolicy["source"]["cancellationHours"] =
    ownCancel != null ? "offering" : defaultCancel != null ? "default" : d ? "platform" : "none";

  // ── Reschedule. No per-offering column; default then platform.
  const rescheduleHours =
    (d ? nonNegInt(d.rescheduleHours) : null) ?? PLATFORM_POLICY_DEFAULTS.rescheduleHours;

  // ── Buffers. offering attr → talent default → hours row → 0. Same chain,
  //    same clamp, as the slot engine, so a slot offered is a slot held.
  const bufferBeforeMin =
    intIn(attrs?.bufferBeforeMin, 0, BUFFER_MAX_MIN) ??
    (d ? intIn(d.bufferBeforeMin, 0, BUFFER_MAX_MIN) : null) ??
    intIn(hoursRow?.bufferBeforeMin, 0, BUFFER_MAX_MIN) ??
    PLATFORM_POLICY_DEFAULTS.bufferBeforeMin;
  const bufferAfterMin =
    intIn(attrs?.bufferAfterMin, 0, BUFFER_MAX_MIN) ??
    (d ? intIn(d.bufferAfterMin, 0, BUFFER_MAX_MIN) : null) ??
    intIn(hoursRow?.bufferAfterMin, 0, BUFFER_MAX_MIN) ??
    PLATFORM_POLICY_DEFAULTS.bufferAfterMin;

  // ── Notice. Delegated unchanged to the existing rule; its canonical store
  //    moves in a separate program, so this module never re-derives it.
  const minNoticeMin = resolveEffectiveMinNoticeMin({
    hoursMinNoticeMin: typeof hoursRow?.minNoticeMin === "number" ? hoursRow.minNoticeMin : null,
    sellingDefaults,
  });

  return {
    reserveMode,
    depositPct,
    cancellationHours,
    rescheduleHours,
    bufferBeforeMin,
    bufferAfterMin,
    minNoticeMin,
    source: { depositPct: depositSource, cancellationHours: cancelSource },
  };
}

/**
 * A public offering with its effective deposit / cancellation applied, so the
 * booking sheet's payment copy (`who-step-payment-copy.ts`) states what
 * checkout will charge. PUBLIC LOADERS ONLY: the owner's editor must keep the
 * raw row, or saving would turn "uses my default" into an explicit value.
 */
export function withEffectivePolicy<
  T extends {
    reserveMode: OfferingReserveMode;
    depositPct: number | null;
    cancellationHours: number | null;
  },
>(offering: T, sellingDefaults: unknown): T {
  const effective = resolveOfferingPolicy(offering, sellingDefaults);
  return {
    ...offering,
    reserveMode: effective.reserveMode,
    depositPct: effective.depositPct,
    cancellationHours: effective.cancellationHours,
  };
}

/**
 * WSF-B: a public offering whose inherited (null) booking mode is replaced by
 * its EFFECTIVE mode from resolveEffectiveBookingMode, so every downstream
 * `bookingMode === "instant"` check on the public page reads the same answer
 * the server enforces. PUBLIC LOADERS ONLY, same reason as withEffectivePolicy:
 * the editor must keep null so "uses my default" survives a save.
 */
export function withEffectiveBookingMode<T extends { bookingMode: OfferingBookingMode | null }>(
  offering: T,
  sellingDefaults: unknown,
): T {
  const eff = resolveEffectiveBookingMode({ offering, defaults: sellingDefaults });
  const mode: OfferingBookingMode = eff.mode === "closed" ? "request" : eff.mode;
  return { ...offering, bookingMode: mode };
}

/**
 * Readiness is kept on purpose (coordinator ruling 2026-09-28): in prod only
 * one of the talents with instant offerings has a hours row, and the slots
 * route already returns zero slots without hours, so those instant CTAs led
 * nowhere; request is strictly better and matches §1. A talent with hours,
 * durations and online collect ready (Jor's shape) stays instant.
 *
 * PAY-2: `payoutsReady` is platform Checkout (`isPlatformCheckoutReady`), not
 * Connect. Missing hours still fall back to request and hide deposit who-step
 * honesty (AUD-004 chat) — QA deposit fixtures must seed working hours.
 *
 * WSF-C: withEffectiveBookingMode plus readiness (§1 row 4) and, on a direct
 * channel, the talent's switches (§8). PUBLIC LOADERS ONLY.
 *  - `hasWorkingHours` null/undefined = unknown: readiness never downgrades;
 *  - `switches` null = agency-routed (§7): switches do not apply;
 *  - a service left with no route keeps an inquiry mode and gets
 *    `publicCtaHidden`, so every surface hides its button.
 */
export function withPublicAvailability<
  T extends {
    bookingMode: OfferingBookingMode | null;
    kind: string;
    durationMinutes: number | null;
    reserveMode: OfferingReserveMode;
    allowPayInPerson?: boolean;
    publicCtaHidden?: boolean;
  },
>(
  offering: T,
  sellingDefaults: unknown,
  ctx: { switches?: AcceptingSwitches | null; hasWorkingHours?: boolean | null; payoutsReady: boolean },
): T {
  const readiness =
    ctx.hasWorkingHours == null
      ? null
      : instantReadiness(
          readinessGaps({
            kind: offering.kind,
            hasWorkingHours: ctx.hasWorkingHours,
            durationMinutes: offering.durationMinutes ?? null,
            takesMoneyOnline: takesMoneyOnline(offering.reserveMode, offering.allowPayInPerson === true),
            payoutsReady: ctx.payoutsReady,
          }),
        );
  const eff = resolveEffectiveBookingMode({ offering, defaults: sellingDefaults, readiness });
  if (!ctx.switches) {
    return { ...offering, bookingMode: eff.mode === "closed" ? "request" : eff.mode };
  }
  const mode = applySwitchesToMode(eff.mode, ctx.switches);
  if (mode === "none") return { ...offering, bookingMode: "inquiry", publicCtaHidden: true };
  return { ...offering, bookingMode: mode };
}
