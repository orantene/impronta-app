/**
 * from-foundation: the Demo Foundation JSON files as one manifest of demos.
 *
 * Other scripts import the loader from ./foundation-load (a .ts module, so the
 * type checker can follow it). Run this file directly for a read-only summary:
 *
 *   cd web && npx tsx scripts/demo-talents/from-foundation.mts [--dir <folder>] [--code TAL-93101]
 */
import { loadFoundation } from "./foundation-load";

export * from "./foundation-load";

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

if (process.argv[1]?.endsWith("from-foundation.mts")) {
  const demos = loadFoundation({ dir: opt("--dir") });
  const code = opt("--code");
  if (code) {
    console.log(JSON.stringify(demos.find((d) => d.profileCode === code) ?? null, null, 2));
  } else {
    const live = demos.filter((d) => d.isLive).length;
    const first = demos[0]?.profileCode;
    console.log(`${demos.length} demos (${live} live, ${demos.length - live} new); first ${first}`);
    for (const d of demos.slice(0, 5)) console.log(d.demoId, d.profileCode, d.email, d.displayName);
  }
}
