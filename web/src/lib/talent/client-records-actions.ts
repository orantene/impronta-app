"use server";

import { randomUUID } from "node:crypto";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import {
  parseClientDetails,
  parseClientNote,
  type ClientDetailsInput,
  type ClientRecordErrorCode,
} from "@/lib/talent/client-records";

/**
 * Writers behind the Clients panels: Add client, Edit details, private Note,
 * Archive / Restore. Every write is owner-checked against the signed-in user
 * and lands in `talent_client_records`. A failure is returned as a code; no
 * path reports success without the row having been written.
 */
export type ClientRecordResult =
  | { ok: true; key: string }
  | { ok: false; code: ClientRecordErrorCode };

async function ownerClient(talentProfileId: string) {
  const session = await getCachedActorSession();
  if (!session.user) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("user_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error || data?.user_id !== session.user.id) return null;
  return admin;
}

function failure(scope: string, err: { code?: string; message?: string } | null): ClientRecordResult {
  logServerError(`talent.clientRecords.${scope}`, err);
  // 42P01 / PGRST205: the table is not there yet. Say so instead of pretending.
  const missing = err?.code === "42P01" || err?.code === "PGRST205";
  return { ok: false, code: missing ? "unavailable" : "failed" };
}

function validKey(key: string): boolean {
  return key.length > 0 && key.length <= 120;
}

export async function createClientRecord(
  talentProfileId: string,
  input: ClientDetailsInput,
): Promise<ClientRecordResult> {
  const parsed = parseClientDetails(input);
  if (!parsed.ok) return parsed;
  const admin = await ownerClient(talentProfileId);
  if (!admin) return { ok: false, code: "forbidden" };
  const key = `record:${randomUUID()}`;
  const { error } = await admin.from("talent_client_records").insert({
    talent_profile_id: talentProfileId,
    client_key: key,
    name: parsed.value.name,
    email: parsed.value.email,
    phone: parsed.value.phone,
  });
  if (error) return failure("create", error);
  return { ok: true, key };
}

export async function updateClientDetails(
  talentProfileId: string,
  clientKey: string,
  input: ClientDetailsInput,
): Promise<ClientRecordResult> {
  if (!validKey(clientKey)) return { ok: false, code: "not_found" };
  const parsed = parseClientDetails(input);
  if (!parsed.ok) return parsed;
  const admin = await ownerClient(talentProfileId);
  if (!admin) return { ok: false, code: "forbidden" };
  const { error } = await admin.from("talent_client_records").upsert(
    {
      talent_profile_id: talentProfileId,
      client_key: clientKey,
      name: parsed.value.name,
      email: parsed.value.email,
      phone: parsed.value.phone,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "talent_profile_id,client_key" },
  );
  if (error) return failure("update", error);
  return { ok: true, key: clientKey };
}

export async function saveClientNote(
  talentProfileId: string,
  clientKey: string,
  note: string | null,
): Promise<ClientRecordResult> {
  if (!validKey(clientKey)) return { ok: false, code: "not_found" };
  const parsed = parseClientNote(note);
  if (!parsed.ok) return parsed;
  const admin = await ownerClient(talentProfileId);
  if (!admin) return { ok: false, code: "forbidden" };
  const { error } = await admin.from("talent_client_records").upsert(
    {
      talent_profile_id: talentProfileId,
      client_key: clientKey,
      note: parsed.value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "talent_profile_id,client_key" },
  );
  if (error) return failure("note", error);
  return { ok: true, key: clientKey };
}

async function setArchived(
  talentProfileId: string,
  clientKey: string,
  archived: boolean,
): Promise<ClientRecordResult> {
  if (!validKey(clientKey)) return { ok: false, code: "not_found" };
  const admin = await ownerClient(talentProfileId);
  if (!admin) return { ok: false, code: "forbidden" };
  const now = new Date().toISOString();
  const { error } = await admin.from("talent_client_records").upsert(
    {
      talent_profile_id: talentProfileId,
      client_key: clientKey,
      archived_at: archived ? now : null,
      updated_at: now,
    },
    { onConflict: "talent_profile_id,client_key" },
  );
  if (error) return failure(archived ? "archive" : "restore", error);
  return { ok: true, key: clientKey };
}

export async function archiveClient(talentProfileId: string, clientKey: string): Promise<ClientRecordResult> {
  return setArchived(talentProfileId, clientKey, true);
}

export async function restoreClient(talentProfileId: string, clientKey: string): Promise<ClientRecordResult> {
  return setArchived(talentProfileId, clientKey, false);
}
