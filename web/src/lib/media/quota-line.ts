/**
 * quota-line.ts — the one sentence a talent reads about how full their plan is
 * (execution-plan-2026-08-15 §3 B13).
 *
 * PURE, and shared on purpose. Three surfaces render this line (the builder
 * media picker, the talent Photos section, the workspace Media header) and they
 * used to render nothing at all. One formatter means they cannot disagree about
 * what "almost full" is, and the `cap === null` branch cannot be forgotten on
 * one of them and print "42 of null photos".
 *
 * No `server-only`, no Supabase: the numbers come from
 * `readTalentMediaUsage`, and the threshold from the same
 * `MEDIA_QUOTA_SOFT_WARN_RATIO` the upload gate warns on, so the line turns
 * cool exactly when the post-upload warning would have fired.
 */

import { MEDIA_QUOTA_SOFT_WARN_RATIO } from "@/lib/billing/media-entitlements";

export type MediaQuotaSnapshot = {
  used: number;
  /** null = unmetered. Renders as "no limit", never as a fraction. */
  cap: number | null;
  remaining: number | null;
};

/** How loud the line should be. Cool attention only — never amber or gold. */
export type MediaQuotaTone = "normal" | "attention" | "full";

export type MediaQuotaLine = { text: string; tone: MediaQuotaTone };

/**
 * Build the line. `talentName` switches it to third person for staff reading
 * someone else's quota ("Ana Ruiz: 142 of 150 photos used on their plan.").
 *
 * `t` is the catalog lookup; the `{...}` placeholders are substituted here so
 * every caller interpolates identically.
 */
export function formatMediaQuotaLine(
  t: (key: string) => string,
  quota: MediaQuotaSnapshot | null | undefined,
  talentName?: string | null,
): MediaQuotaLine | null {
  if (!quota) return null;

  const named = typeof talentName === "string" && talentName.trim().length > 0;
  const name = named ? talentName!.trim() : "";

  if (quota.cap === null) {
    return {
      text: named
        ? t("dashboard.mediaQuota.forTalentUnlimited").replace("{talent}", name)
        : t("dashboard.mediaQuota.unlimited"),
      tone: "normal",
    };
  }

  const cap = quota.cap;
  const used = Math.max(0, quota.used);
  const remaining = quota.remaining === null ? Math.max(0, cap - used) : Math.max(0, quota.remaining);

  const head = (named ? t("dashboard.mediaQuota.forTalent") : t("dashboard.mediaQuota.usage"))
    .replace("{talent}", name)
    .replace("{used}", String(used))
    .replace("{cap}", String(cap));

  if (remaining === 0) {
    return { text: `${head} ${t("dashboard.mediaQuota.full")}`, tone: "full" };
  }

  // Same trigger as the upload gate's soft warn, so "almost full" means one
  // thing on every surface.
  const tone: MediaQuotaTone =
    used >= Math.floor(cap * MEDIA_QUOTA_SOFT_WARN_RATIO) ? "attention" : "normal";

  return {
    text: `${head} ${t("dashboard.mediaQuota.roomLeft").replace("{remaining}", String(remaining))}`,
    tone,
  };
}

/**
 * One more photo just landed. Advances a snapshot the caller already has
 * instead of re-reading the library, so the line stays honest between loads.
 * Shaped as a `useState` updater so a caller is one line.
 */
export function advanceMediaQuota(
  prev: MediaQuotaSnapshot | null,
): MediaQuotaSnapshot | null {
  if (!prev) return prev;
  return {
    ...prev,
    used: prev.used + 1,
    remaining: prev.remaining === null ? null : Math.max(0, prev.remaining - 1),
  };
}

/**
 * Tailwind class for a tone. Cool blue for attention (the admin palette bans
 * amber/gold accents) and the shared error red for a full plan. Lives with the
 * formatter so a fourth surface cannot invent a fourth colour.
 *
 * `-muted` is 0.72 alpha and `-dim` is 0.38 — the normal tone uses the readable
 * one on purpose; this line is information, not decoration.
 */
export function mediaQuotaToneClass(tone: MediaQuotaTone): string {
  if (tone === "full") return "text-admin-red";
  // Same cool blue the partial-success release warning uses (#1117) — the
  // admin palette bans amber/gold accents, so attention is blue here too.
  if (tone === "attention") return "text-[#2c5fdb]";
  return "text-admin-ink-muted";
}
