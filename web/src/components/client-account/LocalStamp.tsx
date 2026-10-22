"use client";

/**
 * TUL-1909: a message time in the VIEWER's own zone. The server (and the first client pass) draws the
 * account zone so markup matches; once mounted the browser zone takes over. Same wording as the
 * server `stamp`: "date, time zone".
 */
import { formatZonedWhen } from "@/lib/client-account/area-pure";
import { stampText } from "@/lib/client-account/stamp-text";
import { useViewerTimeZone } from "@/lib/messages-v5/viewer-time";

export function LocalStamp({ iso, locale, fallbackZone }: { iso: string | null | undefined; locale: "es" | "en"; fallbackZone: string }) {
  const zone = useViewerTimeZone();
  const text = stampText(formatZonedWhen(iso ?? null, zone ?? fallbackZone, locale));
  return text ? <>{text}</> : null;
}
