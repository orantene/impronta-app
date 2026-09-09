/**
 * One literal for the data-export route, in a module that is not a server-action
 * file.
 *
 * WHY IT IS NOT WHERE IT WAS. It started as `export const ACCOUNT_EXPORT_PATH`
 * inside `lib/server-actions/user-prefs.ts`, which carries `"use server"`. That
 * directive means every export in the file becomes a server action, so a
 * non-async export is a build error and not a style preference — Turbopack
 * refuses the whole module, and the failure lands on `next build` rather than
 * on tsc or eslint, which both consider it fine. `verify:server-actions` exists
 * for exactly this shape.
 *
 * WHY NOT IN `export-bundle.ts`. That module opens with `import "server-only"`,
 * correctly — it reads sixteen tables with the service role. A path string has
 * no business being unreachable from a client component that wants to link to
 * it, so the constant lives on its own with no directive at all.
 */
export const ACCOUNT_EXPORT_PATH = "/api/account/export";
