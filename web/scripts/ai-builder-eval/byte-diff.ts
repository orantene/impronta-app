/**
 * Pure helper for the screenshot determinism check. Lives in its own module so
 * `screenshot.test.ts` can import it without running `screenshot.ts`, whose
 * top-level `main()` needs public/_eval/ and a Playwright browser.
 */

/** Count differing bytes between two buffers (length delta counts as diffs). */
export function countByteDifferences(a: Buffer, b: Buffer): number {
  let diff = Math.abs(a.length - b.length);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) diff++;
  return diff;
}
