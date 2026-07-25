import type { DirectoryCardDTO } from "@/lib/directory/types";

/**
 * One map pin: every mappable talent sharing a city centroid.
 *
 * Talent coordinates come from `residence_city_id` and are a CITY centroid,
 * not a precise per-talent point, so many talents land on the exact same
 * lat/lng. Clustering by city is the honest representation.
 */
export type CityCluster = {
  key: string;
  lat: number;
  lng: number;
  label: string;
  items: DirectoryCardDTO[];
};
