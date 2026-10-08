/**
 * TUL-290 (visible-browser timing harness): the pure parts, unit-tested without a browser or a database.
 *
 * Why it exists: every browser pane we have reports `visibilityState: "hidden"`, so client render timings are
 * invalid there. A headless Chromium run (rAF fires, the page is "visible") measures the real
 * render-to-content time of the talent dashboard pages.
 *
 * Safety rules, all enforced here and tested:
 *   - the ONLY account that can be minted is the TEST talent TAL-93900; Jorgelina (TAL-93938) and any other
 *     code are refused before a single call is made;
 *   - no password is ever typed or stored: the session comes from the service role (`generateLink` +
 *     `verifyOtp`);
 *   - the storage state is written to a temp dir (mode 0600 in a 0700 dir) and deleted after the run;
 *   - nothing here is ever printed: tokens never reach a log, the table only has timings.
 */
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const TEST_TALENT_CODE = "TAL-93900";
export const FORBIDDEN_TALENT_CODES: readonly string[] = ["TAL-93938"];
export const PROD_SUPABASE_REF = "pluhdapdnuiulvxmyspd";
export const APP_HOST = "https://app.tulala.digital";

export interface TimedPage {
  key: "today" | "messages" | "profile" | "builder";
  path: string;
}
export const TIMED_PAGES: readonly TimedPage[] = [
  { key: "today", path: "/talent/today" },
  { key: "messages", path: "/talent/messages" },
  { key: "profile", path: "/talent/profile" },
  { key: "builder", path: "/talent/page-builder" },
];
export const LOADS_PER_PAGE = 3;
export const CONTENT_TIMEOUT_MS = 90_000;

/** Refuses anything but the test talent, before any network call. */
export function assertTestTalent(code: string): void {
  const c = (code ?? "").trim().toUpperCase();
  if (FORBIDDEN_TALENT_CODES.includes(c)) throw new Error(`REFUSED: ${c} is a real talent; the harness only signs in as ${TEST_TALENT_CODE}.`);
  if (c !== TEST_TALENT_CODE) throw new Error(`REFUSED: the harness only signs in as ${TEST_TALENT_CODE}, not "${code}".`);
}

/** True for React hydration / minified production errors we want to catch (#418 text mismatch, #423, #425). */
export function isHydrationError(text: string): boolean {
  return /Minified React error #(418|423|425)\b|Hydration failed|hydrat\w+ (?:error|mismatch)|did not match\. (?:Server|Client)/i.test(text);
}

/**
 * Runs inside the page on every navigation (addInitScript). Polls every animation frame, so it only
 * measures real paint time when the page is visible (rAF is the whole point of this harness). Content is
 * "ready" when the main area has real text and no loading word near the top.
 */
export const CONTENT_PROBE_INIT = `(() => {
  const w = window;
  w.__timing = { firstContentMs: null, visibility: document.visibilityState, frames: 0 };
  const LOADING = /\\b(Cargando|Loading)\\b/i;
  const tick = () => {
    w.__timing.frames += 1;
    const root = document.querySelector('main, [role="main"]') || document.body;
    const text = (root && root.innerText) || '';
    if (w.__timing.firstContentMs === null && text.trim().length >= 300 && !LOADING.test(text.slice(0, 1500))) {
      w.__timing.firstContentMs = Math.round(performance.now());
      w.__timing.visibility = document.visibilityState;
    }
    if (w.__timing.firstContentMs === null) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

export interface LoadSample {
  page: TimedPage["key"];
  load: number;
  ttfbMs: number | null;
  domContentLoadedMs: number | null;
  firstContentMs: number | null; // null = never within the timeout
  visibility: string;
  hydrationErrors: string[];
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

export interface PageSummary {
  page: TimedPage["key"];
  loads: number;
  contentMs: { min: number | null; median: number | null; max: number | null };
  neverRendered: number;
  hydrationErrors: number;
  notVisible: number;
}

export function summarize(samples: readonly LoadSample[]): PageSummary[] {
  return TIMED_PAGES.map((p) => {
    const mine = samples.filter((s) => s.page === p.key);
    const times = mine.map((s) => s.firstContentMs).filter((x): x is number => typeof x === "number");
    return {
      page: p.key,
      loads: mine.length,
      contentMs: { min: times.length ? Math.min(...times) : null, median: median(times), max: times.length ? Math.max(...times) : null },
      neverRendered: mine.length - times.length,
      hydrationErrors: mine.reduce((n, s) => n + s.hydrationErrors.length, 0),
      notVisible: mine.filter((s) => s.visibility !== "visible").length,
    };
  });
}

const fmt = (n: number | null) => (n === null ? "never" : `${(n / 1000).toFixed(1)}s`);

/** The table printed at the end of a run. Timings and counts only. */
export function formatTable(sum: readonly PageSummary[]): string {
  const head = "page       loads  content min / median / max      never  #418  hidden";
  const rows = sum.map(
    (s) =>
      `${s.page.padEnd(10)} ${String(s.loads).padStart(5)}  ${`${fmt(s.contentMs.min)} / ${fmt(s.contentMs.median)} / ${fmt(s.contentMs.max)}`.padEnd(32)} ${String(s.neverRendered).padStart(5)} ${String(s.hydrationErrors).padStart(5)} ${String(s.notVisible).padStart(7)}`,
  );
  return [head, ...rows].join("\n");
}

/** @supabase/ssr cookie(s) for a session: base64- prefixed, chunked at 3180 chars like the library does. */
export function buildSessionCookies(
  session: { access_token: string; token_type: string; expires_in: number; expires_at?: number; refresh_token: string; user: unknown },
  host: string,
  ref: string,
): Array<{ name: string; value: string; domain: string; path: string; secure: boolean; httpOnly: boolean; sameSite: "Lax" }> {
  const payload = JSON.stringify({
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  });
  const encoded = `base64-${Buffer.from(payload).toString("base64")}`;
  const name = `sb-${ref}-auth-token`;
  const base = { domain: host, path: "/", secure: true, httpOnly: false, sameSite: "Lax" as const };
  const CHUNK = 3180;
  if (encoded.length <= CHUNK) return [{ name, value: encoded, ...base }];
  const out = [];
  for (let i = 0, off = 0; off < encoded.length; off += CHUNK, i += 1) out.push({ name: `${name}.${i}`, value: encoded.slice(off, off + CHUNK), ...base });
  return out;
}

/** The Supabase calls the mint needs, injectable so the tests never touch a database. */
export interface MintPorts {
  /** Service role: the auth user's email for a profile code, or null. */
  emailForProfileCode(code: string): Promise<string | null>;
  /** Service role: a magic-link hashed token for the email. */
  hashedTokenFor(email: string): Promise<string>;
  /** Anon client: exchange the hashed token for a session. */
  verifyOtp(tokenHash: string): Promise<{ access_token: string; token_type: string; expires_in: number; expires_at?: number; refresh_token: string; user: unknown }>;
}

export interface StorageState {
  cookies: ReturnType<typeof buildSessionCookies>;
  origins: never[];
}

/** Mints the test talent's session as a Playwright storage state. Never logs anything. */
export async function mintTestTalentState(ports: MintPorts, opts: { code?: string; host?: string; ref?: string } = {}): Promise<StorageState> {
  const code = opts.code ?? TEST_TALENT_CODE;
  assertTestTalent(code);
  const ref = opts.ref ?? PROD_SUPABASE_REF;
  if (ref !== PROD_SUPABASE_REF) throw new Error("REFUSED: only the production Supabase project is a valid target for the timing harness.");
  const email = await ports.emailForProfileCode(code);
  if (!email) throw new Error(`no auth user found for ${code}`);
  const session = await ports.verifyOtp(await ports.hashedTokenFor(email));
  return { cookies: buildSessionCookies(session, new URL(opts.host ?? APP_HOST).hostname, ref), origins: [] };
}

/** Temp storage state: a fresh 0700 dir and a 0600 file. Returns the file path. */
export function writeTempState(state: StorageState, dirOverride?: string): string {
  const dir = mkdtempSync(join(dirOverride ?? tmpdir(), "tulala-timing-"));
  chmodSync(dir, 0o700);
  const file = join(dir, "state.json");
  writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
  return file;
}

/** Deletes the state file and its temp dir; safe to call twice. */
export function deleteTempState(file: string | null | undefined): boolean {
  if (!file || !/tulala-timing-/.test(file)) return false;
  const dir = join(file, "..");
  rmSync(dir, { recursive: true, force: true });
  return !existsSync(dir);
}
