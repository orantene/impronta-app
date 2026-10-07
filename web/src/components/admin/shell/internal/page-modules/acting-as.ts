/**
 * DS-31: the "Acting as ..." chip in the dashboard top bar reads like admin
 * impersonation. On the talent surface a normal owner is only ever looking at
 * her own workspace, so the chip shows only when someone is really acting as
 * another party: the shell's `impersonating` state (HQ staff viewing a tenant).
 * The workspace surface keeps its chip (it is the workspace switcher there).
 */
export type ActingAsInput = {
  surface: "workspace" | "talent" | string;
  impersonating: { tenantName?: string | null } | null | undefined;
};

export function shouldShowActingAs(input: ActingAsInput): boolean {
  if (input.surface === "workspace") return true;
  return Boolean(input.impersonating);
}

/** The NAME shown in the chip: the workspace being acted on, else the person. */
export function actingAsLabel(input: {
  impersonating: { tenantName?: string | null } | null | undefined;
  personName: string;
}): string {
  return input.impersonating?.tenantName?.trim() || input.personName;
}
