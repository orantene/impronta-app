/**
 * The write guard shared by every script that can change the database. Nothing
 * writes unless --yes-write is on the command line; without it the script runs
 * as a dry run and says so. verify.mts never writes and does not use this.
 */
export type RunMode = { write: boolean; explicitDryRun: boolean; notice: string | null };

export function resolveRunMode(argv: readonly string[]): RunMode {
  const yes = argv.includes("--yes-write");
  const dry = argv.includes("--dry-run");
  if (yes && dry) throw new Error("REFUSE: --yes-write and --dry-run contradict each other");
  if (yes) return { write: true, explicitDryRun: false, notice: null };
  return {
    write: false,
    explicitDryRun: dry,
    notice: dry ? null : "no --yes-write: running as a dry run, nothing will be written. Add --yes-write to write.",
  };
}
