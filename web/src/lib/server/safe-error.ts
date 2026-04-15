import { improntaLog } from "@/lib/server/structured-log";

/** User-facing copy — never include DB or stack details. */
export const CLIENT_ERROR = {
  generic: "Request failed.",
  directoryLoad: "Unable to load directory.",
  saveTalent: "Unable to update saved talent.",
  inquiry: "Could not submit inquiry. Try again.",
  update: "Update failed. Try again.",
  signIn: "Invalid email or password.",
  signUp: "Could not complete sign up.",
  loadPage: "Unable to load this page.",
} as const;

function formatUnknownError(err: unknown): { line: string; stack?: string } {
  if (err instanceof Error) {
    return { line: err.message, stack: err.stack };
  }
  if (err !== null && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const msg = o.message;
    if (typeof msg === "string") {
      const parts = [msg];
      for (const key of ["code", "details", "hint"] as const) {
        const v = o[key];
        if (v !== undefined && v !== null && String(v) !== "") {
          parts.push(`${key}=${String(v)}`);
        }
      }
      return { line: parts.join(" | ") };
    }
    try {
      return { line: JSON.stringify(err) };
    } catch {
      /* fall through */
    }
  }
  return { line: String(err) };
}

export function logServerError(context: string, err: unknown): void {
  const { line, stack } = formatUnknownError(err);
  console.error(`[${context}]`, line, stack ?? "");
  if (process.env.NODE_ENV === "production") {
    void improntaLog("server_error", {
      context,
      message: line.slice(0, 500),
      hasStack: Boolean(stack),
    });
  }
}

/** True when PostgREST reports unknown columns/tables (migration not applied yet). */
export function isPostgrestMissingColumnError(err: unknown): boolean {
  if (err !== null && typeof err === "object") {
    const code = (err as { code?: string }).code;
    // PGRST205: relation not in schema cache (unknown table / not yet migrated).
    if (code === "PGRST205") return true;
    // 42703: undefined_column (migration not applied yet).
    if (code === "42703") return true;
  }
  const msg = String(
    err !== null && typeof err === "object" && "message" in err
      ? (err as { message?: string }).message
      : err,
  ).toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("could not find") ||
    msg.includes("schema cache")
  );
}
