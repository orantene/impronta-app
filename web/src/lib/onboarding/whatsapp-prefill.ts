/**
 * The essentials step shows a fixed "+52" box beside the WhatsApp input, so a
 * prefilled value must not repeat the country code (TUL-1157).
 */
export function stripMxCountryCode(value: string): string {
  const v = value.trim();
  const m = v.match(/^(?:\+\s*52|0052|52)[\s().-]*(\d[\d\s().-]*)$/);
  if (!m) return v;
  const rest = m[1].replace(/\D/g, "");
  // A bare "52" prefix only counts when the remainder is a 10-digit MX number.
  if (!/^\+|^0052/.test(v) && rest.length !== 10) return v;
  return m[1].trim();
}
