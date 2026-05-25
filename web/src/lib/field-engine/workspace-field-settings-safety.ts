export function sanitizeWorkspaceFieldCatalogOverride(input: {
  enabled?: boolean | null;
  required?: boolean | null;
}): {
  enabled?: boolean | null;
  required?: boolean | null;
} {
  if (input.enabled === false && input.required === true) {
    return { ...input, required: false };
  }
  return { ...input };
}
