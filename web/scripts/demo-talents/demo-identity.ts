/**
 * Identity guards and password handling shared by the demo-talent scripts.
 *
 * The demo batch is the only thing the seeders are allowed to touch, so every
 * write path proves a row is a demo row first: a TAL-93xxx profile code, an
 * email on a demo domain, and (checked against the database by the callers) an
 * auth user carrying app_metadata.demo_batch.
 *
 * Nothing in here ever logs a password. It is read from the environment and
 * handed straight to the auth admin call.
 */

/** Profile codes reserved for the demo batch (TAL-91xxx / 92xxx are older demos). */
export const DEMO_CODE_RE = /^TAL-93\d{3}$/;

/** The 10 original demos use @impronta.test; the 214 new ones use the workbook domain. */
export const DEMO_EMAIL_DOMAINS = ["@impronta.test", "@demo.tulala.digital"] as const;

export function isDemoEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return DEMO_EMAIL_DOMAINS.some((d) => e.endsWith(d));
}

export function assertDemoIdentity(d: { profileCode: string; email: string }): void {
  if (!DEMO_CODE_RE.test(d.profileCode)) throw new Error(`not a demo code: ${d.profileCode}`);
  if (!isDemoEmail(d.email)) throw new Error(`not a demo email: ${d.email}`);
}

/** One shared password for every demo account (owner decision 2026-09-29). */
export const DEMO_PASSWORD_MIN_LENGTH = 16;

export type DemoPasswordStatus = "ok" | "unset" | "weak";

/** ok = at least 16 characters with an upper case letter, a lower case letter and a digit. */
export function demoPasswordStatus(env: Record<string, string | undefined> = process.env): DemoPasswordStatus {
  const p = env.DEMO_PASSWORD ?? "";
  if (p.length === 0) return "unset";
  const strong = p.length >= DEMO_PASSWORD_MIN_LENGTH && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p);
  return strong ? "ok" : "weak";
}

/**
 * Read the shared demo password from DEMO_PASSWORD, or refuse. The error text
 * never includes the value. It is only ever handed to the auth admin call.
 */
export function readDemoPassword(env: Record<string, string | undefined> = process.env): string {
  const status = demoPasswordStatus(env);
  if (status !== "ok") {
    throw new Error(
      `REFUSE: DEMO_PASSWORD is ${status === "unset" ? "unset" : "too weak"} (need ${DEMO_PASSWORD_MIN_LENGTH}+ characters with upper case, lower case and a digit)`,
    );
  }
  return env.DEMO_PASSWORD as string;
}

/** Strip every secret from a message before it can reach a log, an error or a file. */
export function redact(message: string, secrets: readonly string[]): string {
  let out = message;
  for (const s of secrets) {
    if (s && s.length >= 4) out = out.split(s).join("[redacted]");
  }
  return out;
}
