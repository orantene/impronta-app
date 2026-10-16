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

export type HoursTimeZoneSource = "saved" | "workspace" | "device" | "none";

/**
 * TUL-536: the zone a hours form starts on when nothing is saved. The server
 * default falls back to "UTC" when she has no city and the workspace has no
 * zone, and one tap on Save made that wrong answer real. UTC is therefore
 * treated as "unknown", never as a usable default: the device zone wins over
 * it. A real saved zone (even UTC) is always kept.
 */
export function resolveHoursTimeZone(input: {
  saved?: string | null;
  serverDefault?: string | null;
  device?: string | null;
  listed: readonly string[];
}): { zone: string; source: HoursTimeZoneSource } {
  const ok = (z: string | null | undefined): z is string => Boolean(z && z.trim() && input.listed.includes(z.trim()));
  if (ok(input.saved)) return { zone: input.saved.trim(), source: "saved" };
  const def = input.serverDefault?.trim();
  if (ok(def) && def !== "UTC") return { zone: def, source: "workspace" };
  if (ok(input.device)) return { zone: input.device.trim(), source: "device" };
  return { zone: "", source: "none" };
}
