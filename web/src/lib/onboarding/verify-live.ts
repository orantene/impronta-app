/**
 * 1D · "ready" is a claim about the real page. Fetch the address server-side
 * and require a 200 that contains the person's own name (so neither "Page not
 * found", "Host not registered" nor demo data reads as success). The fetch is
 * injected so the step is unit-testable.
 */

export type LiveCheck =
  | { ok: true }
  | { ok: false; reason: "no_url" | "no_name" | "status" | "name_missing" | "network"; status?: number };

export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function verifyLivePage(input: {
  url: string | null;
  /** The person's own name (professional name, or business name). */
  name: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<LiveCheck> {
  if (!input.url) return { ok: false, reason: "no_url" };
  const needle = normalizeForMatch(input.name ?? "");
  if (!needle) return { ok: false, reason: "no_name" };
  const doFetch = input.fetchImpl ?? fetch;
  try {
    const res = await doFetch(input.url, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(input.timeoutMs ?? 8000),
      headers: { "user-agent": "TulalaOnboardingVerify/1" },
    });
    if (res.status !== 200) return { ok: false, reason: "status", status: res.status };
    const html = normalizeForMatch(await res.text());
    return html.includes(needle) ? { ok: true } : { ok: false, reason: "name_missing" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/** A just-published site can lag a moment: a few spaced tries, then the truth. */
export async function verifyLivePageWithRetry(
  input: Parameters<typeof verifyLivePage>[0] & { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> },
): Promise<LiveCheck> {
  const attempts = input.attempts ?? 3;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: LiveCheck = { ok: false, reason: "network" };
  for (let i = 0; i < attempts; i++) {
    last = await verifyLivePage(input);
    if (last.ok || last.reason === "no_url" || last.reason === "no_name") return last;
    if (i < attempts - 1) await sleep(input.delayMs ?? 1500);
  }
  return last;
}

/**
 * "both" owns two pages (the workspace site and her own talent site). The
 * finish screen may say ready only when BOTH are real: the first failure wins.
 * A missing talent URL is a failure (`no_url`), never a skipped check.
 */
export function combineLiveChecks(workspace: LiveCheck, talent: LiveCheck | null): LiveCheck {
  if (!workspace.ok) return workspace;
  if (talent && !talent.ok) return talent;
  return { ok: true };
}
