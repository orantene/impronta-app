import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { sendEmailResult } from "@/lib/email";
import { signAdmissionToken, verifyAdmissionToken } from "@/lib/sessions/admission-token";
import { tryConsumeRateLimit } from "@/lib/rate-limit";
import type { VenueAdmin } from "./locations";

export type TicketSelfReason =
  | "superseded"
  | "not_found"
  | "too_many_attempts"
  | "channel_unavailable"
  | "invalid"
  | "unavailable";

export async function loadTicketByCode(
  admin: VenueAdmin,
  input: { tenantId: string; code: string },
): Promise<
  | {
      ok: true;
      admissionId: string;
      tokenVersion: number;
      holderName: string | null;
      holderEmail: string | null;
      startsAt: string | null;
      sessionId: string | null;
      status: string;
      code: string;
    }
  | { ok: false; reason: TicketSelfReason }
> {
  const verified = verifyAdmissionToken(input.code);
  if (!verified.ok) return { ok: false, reason: "not_found" };
  if (typeof admin.from !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin
    .from("admissions")
    .select("id, tenant_id, token_version, holder_name, holder_email, starts_at, session_id, status")
    .eq("id", verified.admissionId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (error) {
    logServerError("venues.loadTicketByCode", error);
    return { ok: false, reason: "unavailable" };
  }
  const row = data as {
    id: string;
    token_version: number;
    holder_name: string | null;
    holder_email: string | null;
    starts_at: string | null;
    session_id: string | null;
    status: string;
  } | null;
  if (!row) return { ok: false, reason: "not_found" };
  if (Number(row.token_version) !== verified.tokenVersion) return { ok: false, reason: "superseded" };
  const live = signAdmissionToken(row.id, Number(row.token_version));
  return {
    ok: true,
    admissionId: row.id,
    tokenVersion: Number(row.token_version),
    holderName: row.holder_name,
    holderEmail: row.holder_email,
    startsAt: row.starts_at,
    sessionId: row.session_id,
    status: row.status,
    code: live ?? input.code,
  };
}

export async function ticketTransfer(
  admin: VenueAdmin,
  input: { tenantId: string; code: string; toName: string; toEmail: string },
): Promise<{ ok: true; code: string; tokenVersion: number } | { ok: false; reason: TicketSelfReason }> {
  if (input.toName.trim().length < 1 || !input.toEmail.includes("@")) {
    return { ok: false, reason: "invalid" };
  }
  const loaded = await loadTicketByCode(admin, input);
  if (!loaded.ok) return loaded;
  const nextVersion = loaded.tokenVersion + 1;
  const { error } = await admin
    .from("admissions")
    .update({
      holder_name: input.toName.trim(),
      holder_email: input.toEmail.trim(),
      token_version: nextVersion,
    })
    .eq("id", loaded.admissionId)
    .eq("token_version", loaded.tokenVersion);
  if (error) {
    logServerError("venues.ticketTransfer", error);
    return { ok: false, reason: "unavailable" };
  }
  const code = signAdmissionToken(loaded.admissionId, nextVersion);
  if (!code) return { ok: false, reason: "unavailable" };
  return { ok: true, code, tokenVersion: nextVersion };
}

export async function ticketResend(
  admin: VenueAdmin,
  input: { tenantId: string; code: string },
): Promise<{ ok: true } | { ok: false; reason: TicketSelfReason }> {
  const loaded = await loadTicketByCode(admin, input);
  if (!loaded.ok) return loaded;
  const email = loaded.holderEmail?.trim();
  if (!email) return { ok: false, reason: "channel_unavailable" };
  const sent = await sendEmailResult({
    to: email,
    subject: "Your ticket",
    html: `<p>Your ticket code: ${loaded.code}</p>`,
  });
  if (sent.status !== "sent") return { ok: false, reason: "channel_unavailable" };
  return { ok: true };
}

export async function ticketLookup(
  admin: VenueAdmin,
  input: { tenantId: string; email: string; last4OfReceipt: string },
): Promise<{ ok: true; codes: string[] } | { ok: false; reason: TicketSelfReason }> {
  const email = input.email.trim().toLowerCase();
  const last4 = input.last4OfReceipt.replace(/\D/g, "");
  if (!email.includes("@") || last4.length !== 4) return { ok: false, reason: "invalid" };
  if (!tryConsumeRateLimit(`ticket-lookup:${input.tenantId}:${email}`, 8, 60_000)) {
    return { ok: false, reason: "too_many_attempts" };
  }
  if (typeof admin.from !== "function") return { ok: false, reason: "unavailable" };
  const { data: orders, error: orderErr } = await admin
    .from("orders")
    .select("id, receipt_code")
    .eq("tenant_id", input.tenantId)
    .not("receipt_code", "is", null);
  if (orderErr) {
    logServerError("venues.ticketLookup.orders", orderErr);
    return { ok: false, reason: "unavailable" };
  }
  const orderIds = ((orders ?? []) as { id: string; receipt_code: string | null }[])
    .filter((o) => (o.receipt_code ?? "").slice(-4) === last4)
    .map((o) => o.id);
  if (orderIds.length === 0) return { ok: false, reason: "not_found" };
  const { data: lines, error: lineErr } = await admin
    .from("order_lines")
    .select("id")
    .in("order_id", orderIds);
  if (lineErr) return { ok: false, reason: "unavailable" };
  const lineIds = ((lines ?? []) as { id: string }[]).map((l) => l.id);
  if (lineIds.length === 0) return { ok: false, reason: "not_found" };
  const { data: admissions, error: admErr } = await admin
    .from("admissions")
    .select("id, token_version, holder_email")
    .eq("tenant_id", input.tenantId)
    .in("order_line_id", lineIds);
  if (admErr) return { ok: false, reason: "unavailable" };
  const codes = ((admissions ?? []) as { id: string; token_version: number; holder_email: string | null }[])
    .filter((a) => (a.holder_email ?? "").toLowerCase() === email)
    .map((a) => signAdmissionToken(a.id, Number(a.token_version)))
    .filter((c): c is string => !!c);
  if (codes.length === 0) return { ok: false, reason: "not_found" };
  return { ok: true, codes };
}
