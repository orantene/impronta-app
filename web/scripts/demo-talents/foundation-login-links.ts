/**
 * One-time sign-in links for the demo accounts in a manifest, for the owner to
 * open demos without typing a password. Links are single use and expire, so the
 * CSV is regenerated on demand and lives OUTSIDE the repo (which is public).
 *
 * Same guards as --remove: demo code, demo email domain, an auth user that
 * carries app_metadata.demo_batch, and a profile that matches the manifest.
 * Nothing here logs a link; callers print counts only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { DEMO_BATCH } from "./demos";
import { assertDemoIdentity } from "./demo-identity";
import { assertOutsideRepo, type Manifest } from "./foundation-seed-core";

/**
 * Supabase magic links and OTPs default to a one hour lifetime (auth setting
 * mailer_otp_exp = 3600). generateLink does not return the expiry, so the CSV
 * states the default; a project that changed the setting will differ.
 */
export const LOGIN_LINK_TTL_SECONDS = 3600;

export const LOGIN_LINK_COLUMNS = ["demo_id", "code", "email", "action_link", "generated_at", "expires_at"] as const;
export type LoginLinkRow = Record<(typeof LOGIN_LINK_COLUMNS)[number], string>;

/** RFC 4180 field quoting. */
export function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: readonly LoginLinkRow[]): string {
  const lines = [LOGIN_LINK_COLUMNS.join(",")];
  for (const r of rows) lines.push(LOGIN_LINK_COLUMNS.map((c) => csvField(r[c])).join(","));
  return `${lines.join("\n")}\n`;
}

export type LoginLinkResult = { rows: LoginLinkRow[]; skipped: { code: string; reason: string }[] };

/**
 * Generate a magic link for every demo account in the manifest (or the codes in
 * `only`). `demoIdByCode` labels rows; a code it does not know gets a blank id.
 */
export async function buildLoginLinks(
  admin: SupabaseClient,
  manifest: Pick<Manifest, "entries">,
  demoIdByCode: ReadonlyMap<string, string>,
  now: Date,
  only?: readonly string[],
): Promise<LoginLinkResult> {
  const rows: LoginLinkRow[] = [];
  const skipped: LoginLinkResult["skipped"] = [];
  const generatedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + LOGIN_LINK_TTL_SECONDS * 1000).toISOString();

  const entries = Object.values(manifest.entries)
    .filter((e) => !only || only.includes(e.profileCode))
    .sort((a, b) => a.profileCode.localeCompare(b.profileCode));

  for (const e of entries) {
    assertDemoIdentity(e);
    const { data: u, error: uErr } = await admin.auth.admin.getUserById(e.userId);
    if (uErr || !u.user) {
      skipped.push({ code: e.profileCode, reason: "auth user not found" });
      continue;
    }
    if (u.user.app_metadata?.demo_batch !== DEMO_BATCH) throw new Error(`REFUSE: ${e.email} is not a demo user`);
    if (u.user.email?.toLowerCase() !== e.email.toLowerCase()) throw new Error(`REFUSE: ${e.profileCode} email does not match its auth user`);
    const { data: tp, error: tErr } = await admin
      .from("talent_profiles")
      .select("profile_code, user_id, is_demo")
      .eq("id", e.talentProfileId)
      .maybeSingle();
    if (tErr) throw new Error(`talent_profiles lookup: ${tErr.message}`);
    if (!tp || tp.profile_code !== e.profileCode || tp.user_id !== e.userId || tp.is_demo !== true) {
      throw new Error(`REFUSE: ${e.talentProfileId} does not match manifest`);
    }
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: e.email });
    const link = data?.properties?.action_link;
    if (error || !link) {
      skipped.push({ code: e.profileCode, reason: "no link returned" });
      continue;
    }
    rows.push({
      demo_id: demoIdByCode.get(e.profileCode) ?? "",
      code: e.profileCode,
      email: e.email,
      action_link: link,
      generated_at: generatedAt,
      expires_at: expiresAt,
    });
  }
  return { rows, skipped };
}

/** Write the CSV outside the repo, readable by the owner only. */
export function writeLoginLinksCsv(file: string, rows: readonly LoginLinkRow[], cwd: string = process.cwd()) {
  assertOutsideRepo(file, cwd);
  fs.writeFileSync(file, toCsv(rows), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}
