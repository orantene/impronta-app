/**
 * TUL-660: non-production fault toggle so QA can exercise the AI-error path
 * (offer card + Retry, never an auto-escalation) on staging. Never active when
 * VERCEL_ENV is "production".
 */
export function supportAiForcedError(env: Record<string, string | undefined> = process.env): boolean {
  if (env.VERCEL_ENV === "production") return false;
  return env.SUPPORT_AI_FORCE_ERROR === "1";
}
