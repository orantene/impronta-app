import Link from "next/link";

import type { Professional } from "../_data/professionals";
import { SERVICE_BY_SLUG } from "../_data/services";
import { IconArrowRight, IconPin } from "./icons";

/**
 * Directory / featured card.
 *
 * Future systemization (Template → Directory Card Variant):
 *   - `editorial-portrait` (this one): portrait ratio, ribbon, tag strip
 *   - `square-clean`: photographer-heavy rosters
 *   - `wide-landscape`: venue / estate listings
 *   - `minimal-list`: for dense directories where image is secondary
 *
 * Every card variant consumes the same `Professional` shape — variants
 * differ only in layout. The ribbon ("Destination-ready") is a computed
 * boolean (`travelsGlobally`) that maps to a template-level "badge rule".
 */
export function ProfessionalCard({
  pro,
  variant = "featured",
}: {
  pro: Professional;
  variant?: "featured" | "directory";
}) {
  const service = SERVICE_BY_SLUG[pro.serviceSlug];
  return (
    <Link
      href={`/prototypes/muse-bridal/collective/${pro.slug}`}
      className="muse-card"
      aria-label={`${pro.name} — ${pro.role}`}
    >
      <div className="muse-card__media">
        <img src={pro.portrait} alt={pro.name} loading="lazy" />
        {pro.travelsGlobally ? (
          <span className="muse-card__ribbon">Destination-ready</span>
        ) : null}
      </div>
      <div className="muse-card__body">
        <div className="muse-card__kicker">
          <span>{service?.label ?? pro.role}</span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "var(--muse-muted)",
            }}
          >
            <IconPin size={14} />
            {pro.baseLocation.split(",")[0]}
          </span>
        </div>
        <h3 className="muse-card__name">{pro.name}</h3>
        {variant === "featured" ? (
          <p style={{ fontSize: 14, color: "var(--muse-muted)" }}>{pro.intro}</p>
        ) : null}
        <div className="muse-card__tags">
          {pro.specialties.slice(0, 3).map((tag) => (
            <span key={tag} className="muse-chip muse-chip--soft">
              {tag}
            </span>
          ))}
        </div>
        <div className="muse-card__footer">
          <span>
            <strong>{pro.startingFrom}</strong>
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontSize: 11,
              color: "var(--muse-espresso)",
            }}
          >
            View profile
            <IconArrowRight size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}
