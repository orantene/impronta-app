/**
 * The command Playwright uses to auto-start the app for e2e (TUL-1036).
 *
 * `next dev` checks heap after every request and exits with RESTART_EXIT_CODE
 * once used heap passes 80% of the limit ("Server is approaching the used
 * memory threshold, restarting..."). While it restarts the port refuses
 * connections, so a long CI suite dies with ERR_CONNECTION_REFUSED. The
 * GitHub runner has 16 GB; give CI a larger heap than the 6144 MB the
 * `npm run dev` script hard-codes (that script sets NODE_OPTIONS itself, so it
 * cannot be overridden from env).
 */
export const CI_DEV_HEAP_MB = 10240;

export function e2eWebServerCommand(env: Record<string, string | undefined>): string {
  if (!env.CI) return "npm run dev";
  return `NODE_OPTIONS=--max-old-space-size=${CI_DEV_HEAP_MB} npx next dev -p \${PORT:-3000}`;
}
