export type PlatformFieldSafetyInput = {
  defaultVisibility: readonly string[];
  showInPublic: boolean;
  showInDirectory: boolean;
  showInRegistration: boolean;
  talentEditable: boolean;
  adminOnly: boolean;
  sensitive: boolean;
};

export type PlatformFieldSafetyOutput = {
  defaultVisibility: string[];
  showInPublic: boolean;
  showInDirectory: boolean;
  showInRegistration: boolean;
  talentEditable: boolean;
};

export function sanitizePlatformFieldSafety(
  input: PlatformFieldSafetyInput,
): PlatformFieldSafetyOutput {
  const publicSurfacesAllowed = !input.adminOnly && !input.sensitive;
  const talentSurfacesAllowed = !input.adminOnly && !input.sensitive;
  const defaultVisibility = publicSurfacesAllowed
    ? [...input.defaultVisibility]
    : input.defaultVisibility.filter((channel) => channel !== "public");

  return {
    defaultVisibility: defaultVisibility.length > 0 ? defaultVisibility : ["agency"],
    showInPublic: input.showInPublic && publicSurfacesAllowed,
    showInDirectory: input.showInDirectory && publicSurfacesAllowed,
    showInRegistration: input.showInRegistration && talentSurfacesAllowed,
    talentEditable: input.talentEditable && talentSurfacesAllowed,
  };
}
