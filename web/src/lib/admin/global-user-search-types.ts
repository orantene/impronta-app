export type GlobalUserSearchRole = "talent" | "client" | "admin";

export type GlobalUserSearchResult = {
  key: string;
  kind: GlobalUserSearchRole;
  id: string;
  userId: string | null;
  talentProfileId: string | null;
  displayName: string | null;
  subtitle: string | null;
  profileCode: string | null;
  city: string | null;
  country: string | null;
  roleLabel: string;
  statusLabel: string;
  workflowStatus: string | null;
  talentTypeLabel: string | null;
  completeness: number | null;
  pendingMediaCount: number;
  accountStatus: string | null;
};

export type GlobalUserSearchResponse = {
  results: GlobalUserSearchResult[];
  truncated: boolean;
};
