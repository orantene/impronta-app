/**
 * The line a talent-facing inquiry/booking message carries when the client came
 * from HER OWN talent site. Pure. Other sources (agency, hub) get no line.
 * The inquiry records this as `source_context.host_kind === "talent_site"`.
 */
export function isOwnTalentSiteSource(sourceContext: unknown): boolean {
  if (!sourceContext || typeof sourceContext !== "object") return false;
  return (sourceContext as { host_kind?: unknown }).host_kind === "talent_site";
}

export function talentSiteSourceLine(input: {
  sourceContext: unknown;
  originDomain?: string | null;
  locale?: string | null;
}): string | null {
  if (!isOwnTalentSiteSource(input.sourceContext)) return null;
  const address = (input.originDomain ?? "").trim();
  const es = (input.locale ?? "").toLowerCase().startsWith("es");
  const where = address ? ` (${address})` : "";
  return es ? `Este cliente llegó desde tu sitio web${where}.` : `This client came from your website${where}.`;
}
