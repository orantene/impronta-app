import { builderPlanAllows } from "@/lib/site-admin/builder-capabilities";

export function isShellMutationAllowedForPlan(input: {
  systemTemplateKey: string | null;
  planTier: string | null;
}): boolean {
  if (input.systemTemplateKey !== "site_shell") return true;
  return builderPlanAllows(input.planTier, "builder.shell.edit");
}
