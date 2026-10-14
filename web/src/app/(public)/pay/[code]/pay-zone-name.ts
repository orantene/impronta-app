/**
 * The venue zone as a person says it on /pay: "America/Mexico_City" reads
 * "Mexico City", so "valid until 20:54 (Mexico City time)" (TUL-467). An unset
 * or unusable zone reads "UTC", the zone the clock fell back to.
 */
export function payZoneName(timeZone: string | null | undefined): string {
  const zone = (timeZone ?? "").trim();
  if (!zone || zone === "UTC" || zone === "Etc/UTC") return "UTC";
  const city = zone.split("/").pop() ?? "";
  return city.replace(/_/g, " ") || "UTC";
}
