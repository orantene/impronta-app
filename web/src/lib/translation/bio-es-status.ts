export const bioEsStatuses = [
  "missing",
  "auto",
  "reviewed",
  "approved",
  "stale",
] as const;

export type BioEsStatus = (typeof bioEsStatuses)[number];

export function isBioEsStatus(v: string | null | undefined): v is BioEsStatus {
  return bioEsStatuses.includes(v as BioEsStatus);
}

export function parseBioEsStatus(
  v: string | null | undefined,
): BioEsStatus {
  return isBioEsStatus(v) ? v : "missing";
}
