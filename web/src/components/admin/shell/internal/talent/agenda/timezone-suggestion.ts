/**
 * Horario time zone: which zone to suggest next to the picker. The saved value
 * always wins; the device zone is only offered (never applied silently) when
 * it is a real listed IANA zone that differs from what is selected.
 */
export function suggestDeviceTimeZone(
  selected: string,
  device: string | null | undefined,
  listed: readonly string[],
): string | null {
  const d = (device ?? "").trim();
  if (!d || d === selected) return null;
  return listed.includes(d) ? d : null;
}

export function readDeviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
