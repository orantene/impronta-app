/**
 * Policy FACTS: read-only values the policy screen and the rendered text take
 * from the stores that already own them. Nothing here is a second copy of a
 * setting; `readPolicyFacts` is a pure projection and `loadPolicyFacts` only
 * fetches the inputs.
 *
 * Sources (one each):
 *  - deposit %, cancel window: `selling_defaults` through `resolveOfferingPolicy`
 *  - in-person methods, where she works: `selling_defaults`
 *  - zone: `talent_service_areas` home base, else `home_city_text` (city only,
 *    D4: never an exact address)
 *  - contact: `talent_sites.chat_enabled` and the published contact links
 *  - name: `display_name` only (D2: never a legal name)
 */

import { resolveOfferingPolicy } from "@/lib/talent/offering-policy-resolver";
import { cityLabelFromPlaceText } from "@/lib/scheduling/timezone-from-place";
import { talentContactHrefs } from "@/lib/talent-site/contact-channels";

export const IN_PERSON_METHODS = ["cash", "transfer", "card_terminal"] as const;
export type InPersonMethod = (typeof IN_PERSON_METHODS)[number];

export const WORK_PLACES = ["studio", "client", "remote"] as const;
export type WorkPlace = (typeof WORK_PLACES)[number];

export type PolicyFacts = {
  /** Display name only. Empty when the talent has none. */
  displayName: string;
  /** Default deposit percentage, 1..99, or null when none is asked. */
  depositPct: number | null;
  inPersonMethods: InPersonMethod[];
  /** Free-cancellation window in hours, or null when flexible. */
  cancelHours: number | null;
  where: WorkPlace[];
  /** Approximate zone (a city or area). Never an exact address. */
  zone: string | null;
  contact: { chat: boolean; whatsapp: boolean; email: boolean };
  /** Who pays the card processing fee. Absent / anything else: the talent ("seller"). */
  processingFeePayer?: "seller" | "client";
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Tolerant: unknown entries are dropped, order follows IN_PERSON_METHODS. */
export function parseInPersonMethods(raw: unknown): InPersonMethod[] {
  if (!Array.isArray(raw)) return [];
  return IN_PERSON_METHODS.filter((m) => raw.includes(m));
}

function parseWhere(raw: unknown): WorkPlace[] {
  if (!Array.isArray(raw)) return ["studio"];
  const out = WORK_PLACES.filter((w) => raw.includes(w));
  return out.length > 0 ? out : ["studio"];
}

export type PolicyFactsInput = {
  displayName?: string | null;
  sellingDefaults: unknown;
  homeBaseName?: string | null;
  homeCityText?: string | null;
  chatEnabled?: boolean | null;
  phone?: string | null;
  phoneE164?: string | null;
  socialLinks?: unknown;
  processingFeePayer?: unknown;
};

export function readPolicyFacts(input: PolicyFactsInput): PolicyFacts {
  const d = isRecord(input.sellingDefaults) ? input.sellingDefaults : {};
  // The same chain checkout and the editor follow. No offering: talent default.
  const effective = resolveOfferingPolicy(
    { reserveMode: null, depositPct: null, cancellationHours: null },
    d,
  );
  const hrefs = talentContactHrefs({
    phone: input.phone ?? null,
    phoneE164: input.phoneE164 ?? null,
    socialLinks: input.socialLinks,
  });
  const cancelHours = effective.cancellationHours;
  return {
    displayName: (input.displayName ?? "").trim(),
    depositPct: effective.depositPct,
    inPersonMethods: parseInPersonMethods(d.inPersonMethods),
    cancelHours: cancelHours != null && cancelHours > 0 ? cancelHours : null,
    where: parseWhere(d.where),
    zone: input.homeBaseName?.trim() || cityLabelFromPlaceText(input.homeCityText) || null,
    processingFeePayer: input.processingFeePayer === "client" ? "client" : "seller",
    contact: {
      chat: input.chatEnabled !== false,
      whatsapp: hrefs.whatsappHref !== "",
      email: hrefs.emailHref !== "",
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reader = { from: (table: string) => any };

type AreaRow = {
  service_kind: string | null;
  city: string | null;
  locations: { display_name_i18n: Record<string, string | null> | null } | null;
};

/** One read of each source. A failed read leaves that fact empty, never throws. */
export async function loadPolicyFacts(admin: Reader, talentProfileId: string): Promise<PolicyFacts | null> {
  const [profileRes, areasRes, siteRes] = await Promise.all([
    admin
      .from("talent_profiles")
      .select("display_name, selling_defaults, home_city_text, phone, phone_e164, social_links")
      .eq("id", talentProfileId)
      .maybeSingle(),
    admin
      .from("talent_service_areas")
      .select("service_kind, city, locations ( display_name_i18n )")
      .eq("talent_profile_id", talentProfileId),
    admin.from("talent_sites").select("chat_enabled").eq("talent_profile_id", talentProfileId).maybeSingle(),
  ]);
  if (profileRes.error || !profileRes.data) return null;
  const p = profileRes.data as {
    display_name: string | null;
    selling_defaults: unknown;
    home_city_text: string | null;
    phone: string | null;
    phone_e164: string | null;
    social_links: unknown;
  };
  // Separate, tolerant read: a failed read leaves the default ("seller").
  const payerRes = await admin
    .from("talent_profiles")
    .select("processing_fee_payer")
    .eq("id", talentProfileId)
    .maybeSingle();
  const payer = (payerRes.error ? null : payerRes.data) as { processing_fee_payer?: unknown } | null;
  const areas = ((areasRes.error ? [] : areasRes.data) ?? []) as AreaRow[];
  const base = areas.find((a) => a.service_kind === "home_base");
  const names = base?.locations?.display_name_i18n;
  const homeBaseName = (names?.en ?? names?.es ?? null) || base?.city || null;
  const site = (siteRes.error ? null : siteRes.data) as { chat_enabled: boolean | null } | null;
  return readPolicyFacts({
    displayName: p.display_name,
    sellingDefaults: p.selling_defaults,
    homeBaseName,
    homeCityText: p.home_city_text,
    chatEnabled: site?.chat_enabled ?? null,
    phone: p.phone,
    phoneE164: p.phone_e164,
    socialLinks: p.social_links,
    processingFeePayer: payer?.processing_fee_payer,
  });
}
