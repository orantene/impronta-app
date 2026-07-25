import type { CityCluster } from "./map-clusters";

/**
 * Zoom-aware grouping of city pins.
 *
 * WHY THIS GROUPS CITIES AND NOT TALENT: every talent in a city carries that
 * city's CENTROID (`residence_city_id`), not a street-level point, so all 34
 * Playa del Carmen talent occupy one identical coordinate. No amount of
 * zooming can separate them, and spreading them apart would invent locations
 * the data does not have. What genuinely overlaps at low zoom is CITIES —
 * Playa/Tulum/Cancún collapse into a few pixels at country zoom — so those are
 * what merge here, splitting apart as the visitor zooms in.
 *
 * Pure + framework-free: uses the standard Web Mercator projection rather than
 * the Maps API, so it is unit-testable and needs no map instance.
 */

/** Merge pins whose projected centres fall within this many pixels. */
export const CLUSTER_MERGE_PX = 64;

/** Web Mercator world coordinate (256px tile space) for a lat/lng. */
function worldPoint(lat: number, lng: number): { x: number; y: number } {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin((clampedLat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * 256,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 256,
  };
}

export type ZoomCluster = {
  /** Stable key: the member city keys, sorted and joined. */
  key: string;
  lat: number;
  lng: number;
  /** Cities merged into this bubble (length 1 = a plain city pin). */
  cities: CityCluster[];
  /** Total talent across the member cities. */
  count: number;
};

/**
 * Group city pins that would visually collide at `zoom`.
 *
 * Greedy single-pass clustering seeded by descending talent count, so the
 * densest city anchors each bubble and the result is deterministic (no
 * dependence on input order beyond the count tie-break).
 */
export function groupClustersForZoom(
  clusters: CityCluster[],
  zoom: number,
  mergePx: number = CLUSTER_MERGE_PX,
): ZoomCluster[] {
  if (clusters.length <= 1) {
    return clusters.map((c) => ({
      key: c.key,
      lat: c.lat,
      lng: c.lng,
      cities: [c],
      count: c.items.length,
    }));
  }

  const scale = Math.pow(2, zoom);
  const projected = clusters.map((c) => {
    const p = worldPoint(c.lat, c.lng);
    return { cluster: c, x: p.x * scale, y: p.y * scale };
  });
  // Densest first so a bubble is anchored by its biggest city.
  projected.sort((a, b) => b.cluster.items.length - a.cluster.items.length);

  const taken = new Set<number>();
  const out: ZoomCluster[] = [];

  for (let i = 0; i < projected.length; i++) {
    if (taken.has(i)) continue;
    taken.add(i);
    const seed = projected[i]!;
    const members = [seed.cluster];

    for (let j = i + 1; j < projected.length; j++) {
      if (taken.has(j)) continue;
      const other = projected[j]!;
      const dx = seed.x - other.x;
      const dy = seed.y - other.y;
      if (Math.sqrt(dx * dx + dy * dy) <= mergePx) {
        taken.add(j);
        members.push(other.cluster);
      }
    }

    const count = members.reduce((n, m) => n + m.items.length, 0);
    // Weight the bubble toward where the talent actually are.
    const lat = members.reduce((s, m) => s + m.lat * m.items.length, 0) / count;
    const lng = members.reduce((s, m) => s + m.lng * m.items.length, 0) / count;
    out.push({
      key: members.map((m) => m.key).sort().join("+"),
      lat,
      lng,
      cities: members,
      count,
    });
  }

  return out;
}
