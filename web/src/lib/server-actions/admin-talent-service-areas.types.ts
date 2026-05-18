// admin-talent-service-areas.types.ts
//
// Types for the canonical Service-Area editor. Kept OUT of the
// "use server" action file (a server-action module may only export async
// functions — exporting a type there ReferenceErrors once a client
// component imports it; same pattern as admin-talent-languages.types.ts).

export type { ResolvedServiceArea } from "@/lib/talent-service-areas-service";

export type SaveServiceAreasInput = {
  talent_profile_id: string;
  /** Curated locations.id for the single home base, or null to clear it. */
  home_base_location_id: string | null;
  /** Curated locations.id list for travel_to service cities. */
  travel_to_location_ids: string[];
  travel_radius_km: number | null;
  travel_fee_required: boolean;
  remote_only: boolean;
};
