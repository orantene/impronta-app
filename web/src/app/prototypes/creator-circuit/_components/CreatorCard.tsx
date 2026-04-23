import Link from "next/link";

import { BASE } from "../_data/nav";
import {
  type Creator,
  formatEngagement,
  formatFollowers,
} from "../_data/creators";
import { IconPin, platformIcon } from "./icons";

/**
 * Stat-rich creator card. Shows headline metrics, platforms, niches,
 * creator type. Used in directory + featured homepage strips.
 */
export function CreatorCard({ creator }: { creator: Creator }) {
  return (
    <Link
      href={`${BASE}/creators/${creator.slug}`}
      className="cc-creator-card"
      aria-label={`${creator.name} — ${creator.role}`}
    >
      <div className="cc-creator-card__media">
        <img src={creator.portrait} alt={creator.name} loading="lazy" />

        <div className="cc-creator-card__badges">
          <span
            className={`cc-creator-card__badge${creator.type === "Hybrid" ? " cc-creator-card__badge--violet" : ""}`}
          >
            {creator.type === "UGC"
              ? "UGC"
              : creator.type === "Influencer"
                ? "Influencer"
                : "UGC + Influencer"}
          </span>
          {creator.featured ? (
            <span className="cc-creator-card__badge">Featured</span>
          ) : null}
        </div>

        <div className="cc-creator-card__platforms">
          {creator.platforms.slice(0, 3).map((p) => (
            <span
              key={p.platform}
              className="cc-creator-card__platform"
              aria-label={p.platform}
              title={`${p.platform} · ${formatFollowers(p.followers)}`}
            >
              {platformIcon(p.platform, 14)}
            </span>
          ))}
        </div>
      </div>

      <div className="cc-creator-card__body">
        <div className="cc-creator-card__header">
          <div>
            <div className="cc-creator-card__name">{creator.name}</div>
            <div className="cc-creator-card__handle">{creator.handle}</div>
          </div>
          <span className="cc-creator-card__niche">{creator.niches[0]}</span>
        </div>

        <div className="cc-creator-card__stats">
          <div>
            <div className="cc-creator-card__stat-value">
              {formatFollowers(creator.headlineFollowers)}
            </div>
            <div className="cc-creator-card__stat-label">Followers</div>
          </div>
          <div>
            <div className="cc-creator-card__stat-value">
              {formatEngagement(creator.headlineEngagement)}
            </div>
            <div className="cc-creator-card__stat-label">Engagement</div>
          </div>
        </div>

        <div className="cc-creator-card__tags">
          {creator.deliverables.slice(0, 2).map((d) => (
            <span key={d} className="cc-chip cc-chip--micro">
              {d}
            </span>
          ))}
        </div>

        <div className="cc-creator-card__location">
          <IconPin size={12} />
          {creator.city}
        </div>
      </div>
    </Link>
  );
}
