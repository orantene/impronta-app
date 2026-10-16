/**
 * llms.txt for talent-site hosts (TUL-589). Built only from the talent's
 * published public profile; pure so the gate and the text are unit-testable.
 */
import { formatMoney } from "@/lib/talent/offerings-money";
import { maxSitePublicGate } from "@/lib/talent-site/resolve-max-site-core";

export interface TalentLlmsService {
  title: string;
  priceText: string;
}

export interface TalentLlmsInput {
  name: string;
  trade: string | null;
  city: string | null;
  languages: string[];
  services: TalentLlmsService[];
}

export interface TalentLlmsGateInput {
  deletedAt: string | null;
  isPubliclyHidden: boolean;
  profileKind: string | null;
  isDemo: boolean;
  sitePublishedAt: string | null;
  planKey: string | null;
}

/** Draft, private, unpublished, demo and resource profiles never get a file. */
export function isTalentLlmsEligible(g: TalentLlmsGateInput): boolean {
  if (g.deletedAt || g.isPubliclyHidden || g.isDemo) return false;
  if (g.profileKind === "resource") return false;
  return maxSitePublicGate({ sitePublishedAt: g.sitePublishedAt, planKey: g.planKey });
}

export function talentServicePriceText(s: {
  priceDisplay?: string | null;
  amountCents?: number | null;
  currency?: string | null;
}): string {
  const cents = s.amountCents;
  const currency = s.currency?.trim().toUpperCase();
  if (s.priceDisplay === "quote" || cents == null || cents <= 0 || !currency) {
    return "Price on request";
  }
  const money = formatMoney(cents, currency, "en");
  return s.priceDisplay === "from" ? `from ${money}` : money;
}

export function buildTalentLlmsTxt(base: URL, t: TalentLlmsInput): string {
  const home = new URL("/", base).toString();
  const facts = [t.trade, t.city].filter((v): v is string => !!v && v.trim() !== "");
  const out = [`# ${t.name}`, ""];
  if (facts.length > 0) out.push(`> ${facts.join(" in ")}`, "");
  if (t.services.length > 0) {
    out.push("## Services", "", ...t.services.map((s) => `- ${s.title}: ${s.priceText}`), "");
  }
  if (t.languages.length > 0) out.push("## Languages", "", t.languages.join(", "), "");
  out.push("## Book", "", `- [Book or send an inquiry](${home})`, "");
  return out.join("\n");
}

/** Which llms.txt a host gets: the marketing file, a talent file, or a 404. */
export function decideLlmsRoute(input: {
  kind: string;
  hostContextHeader: string | null | undefined;
  talentProfileHeader: string | null | undefined;
}): { route: "marketing" } | { route: "talent"; talentProfileId: string } | { route: "not_found" } {
  if (input.kind === "marketing") return { route: "marketing" };
  if (input.kind !== "talent_site") return { route: "not_found" };
  const id = input.talentProfileHeader?.trim();
  if (input.hostContextHeader?.trim() !== "talent_site" || !id) return { route: "not_found" };
  return { route: "talent", talentProfileId: id };
}
