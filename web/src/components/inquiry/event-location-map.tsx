import { ExternalLink, MapPin, Navigation } from "lucide-react";

/**
 * Shows an event location with an embedded Google Maps preview and
 * one-click links for viewing the map or getting directions.
 * Renders nothing if `location` is blank.
 */
export function EventLocationMap({
  location,
  compact = false,
}: {
  location: string | null | undefined;
  /** Compact mode omits the iframe embed — just the text + buttons. */
  compact?: boolean;
}) {
  const loc = location?.trim();
  if (!loc) return null;

  const encoded = encodeURIComponent(loc);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
  const embedUrl = `https://maps.google.com/maps?q=${encoded}&output=embed&zoom=13`;

  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--impronta-gold)]" aria-hidden />
        <span className="text-sm leading-snug">{loc}</span>
      </div>

      {!compact && (
        <div className="overflow-hidden rounded-xl border border-border/40 shadow-sm">
          <iframe
            src={embedUrl}
            width="100%"
            height="180"
            style={{ border: 0, display: "block" }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={`Map: ${loc}`}
            aria-label={`Google Maps preview for ${loc}`}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/20 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-[var(--impronta-gold)]/40 hover:bg-[var(--impronta-gold)]/8 hover:text-[var(--impronta-gold)]"
        >
          <ExternalLink className="size-3" aria-hidden />
          View on map
        </a>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/20 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-[var(--impronta-gold)]/40 hover:bg-[var(--impronta-gold)]/8 hover:text-[var(--impronta-gold)]"
        >
          <Navigation className="size-3" aria-hidden />
          Get directions
        </a>
      </div>
    </div>
  );
}
