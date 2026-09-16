/**
 * Isolated-DB helpers for the onboarding specs: a fixture user signed in via
 * `/api/dev/signin` (@impronta.test only) and a brief carrying a fixture's
 * facts, so the understood card is exercised without a model and without KV.
 */
import type { Page } from "@playwright/test";
import { isolatedService } from "../cases/_isolated-db";
import { fixtureById, type OnboardingFixture } from "../../src/lib/onboarding/fixtures";
import { APP_BASE, MARKETING_BASE } from "./_module";

export async function ensureUser(email: string): Promise<string> {
  const admin = isolatedService();
  const users = (await admin.auth.admin.listUsers({ perPage: 500 })).data?.users ?? [];
  const found = users.find((u) => u.email === email);
  if (found) return found.id;
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (!created.data.user) throw new Error(`could not create ${email}: ${created.error?.message}`);
  return created.data.user.id;
}

/** Replace the user's live brief with one carrying `facts` (fixture rows or custom). */
export async function seedBrief(input: {
  userId: string;
  fixture?: OnboardingFixture["id"];
  facts?: OnboardingFixture["facts"];
  intent?: "talent" | "business" | "unknown";
  step?: string;
  input?: { kind: "text" | "url"; value: string };
}): Promise<string> {
  const admin = isolatedService();
  const fx = input.fixture ? fixtureById(input.fixture) : null;
  const facts = input.facts ?? fx?.facts ?? [];
  await admin.from("tulala_briefs").update({ status: "abandoned" }).eq("profile_id", input.userId).neq("status", "abandoned");
  const moduleInput = input.input ?? (fx?.link ? { kind: "url", value: fx.link } : { kind: "text", value: fx?.sentence.en ?? "x" });
  const { data, error } = await admin
    .from("tulala_briefs")
    .insert({
      profile_id: input.userId,
      locale: "en",
      module_state: { intent: input.intent ?? fx?.intent ?? "unknown", step: input.step ?? "understood", input: moduleInput, locale: "en", updatedAt: new Date().toISOString() },
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seed brief: ${error?.message}`);
  if (facts.length) {
    const rows = facts.map(([factKey, value, source = "user_stated", status]) => ({
      brief_id: data.id,
      fact_key: factKey,
      fact_value: value,
      source,
      status: status ?? (source === "user_stated" ? "confirmed" : "needs_approval"),
      confidence: source === "user_stated" ? 1 : 0.7,
      source_url: fx?.link ?? null,
    }));
    const ins = await admin.from("tulala_brief_facts").insert(rows);
    if (ins.error) throw new Error(`seed facts: ${ins.error.message}`);
  }
  return data.id;
}

export async function loadFacts(briefId: string): Promise<Record<string, unknown>> {
  const admin = isolatedService();
  const { data } = await admin.from("tulala_brief_facts").select("fact_key, fact_value, source, status").eq("brief_id", briefId);
  return Object.fromEntries((data ?? []).map((r) => [r.fact_key, r]));
}

/** Sign in on the app host (cookies are per host, not per port, so they carry to :3105). */
export async function devSignIn(page: Page, email: string): Promise<void> {
  const params = new URLSearchParams({ email, next: "/" });
  // Turbopack drops `/api/dev/*` for a moment after a rebuild (404), and the
  // proxy can answer 502/503 while Next restarts: retry those, nothing else
  // (the journeys harness does the same).
  let headers: string[] = [];
  const seen: number[] = [];
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const res = await page.request.get(`${APP_BASE}/api/dev/signin?${params.toString()}`, { maxRedirects: 0 });
    if (res.status() === 307) {
      headers = res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
      break;
    }
    seen.push(res.status());
    if (![404, 502, 503].includes(res.status())) throw new Error(`dev sign-in ${res.status()}: ${(await res.text()).slice(0, 200)}`);
    await page.waitForTimeout(500 * attempt);
  }
  if (!headers.length) throw new Error(`dev sign-in never answered 307 (${seen.join(", ")})`);
  const origin = new URL(MARKETING_BASE);
  const cookies = headers
    .map((header) => {
      const [pair] = header.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) return null;
      return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), domain: origin.hostname, path: "/" };
    })
    .filter((c): c is { name: string; value: string; domain: string; path: string } => !!c);
  await page.context().addCookies(cookies);
}
