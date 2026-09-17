import "server-only";

/**
 * S4 seam (D-MSG-2, decisions.md): `inquiries` has no `subject` / `title` /
 * `project_label` column — grepped every migration, none exists, and the
 * lane may not add one. The workspace's internal name is therefore
 * event-sourced off `inquiry_action_log` instead of a column: the latest
 * successful `messaging_rename` row's `metadata.new` IS the current name;
 * with no rename yet, the name is `contact_name` (today's fallback, used
 * everywhere the "subject" is drawn — see `loadMessagingInbox`).
 */

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export async function currentInquiryName(
  admin: Admin,
  inquiryId: string,
  fallbackContactName: string,
): Promise<string> {
  const { data, error } = await admin
    .from("inquiry_action_log")
    .select("metadata")
    .eq("inquiry_id", inquiryId)
    .eq("action_type", "messaging_rename")
    .eq("result", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return fallbackName(fallbackContactName);
  const metadata = (data as { metadata: Record<string, unknown> | null }).metadata;
  const renamed = metadata && typeof metadata.new === "string" ? metadata.new.trim() : "";
  return renamed || fallbackName(fallbackContactName);
}

export function fallbackName(contactName: string): string {
  const trimmed = contactName.trim();
  return trimmed === "" ? "Visitor" : trimmed;
}

/**
 * L4: pure. `currentInquiryName` returns `fallbackName(contactName)` exactly
 * when no `messaging_rename` row exists yet for the inquiry (D-MSG-3) — that
 * fallback IS the "generated" name (today: `contact_name`, the intent
 * engine's own extraction from the first message; there is no separate
 * generator to call). A name is "generated" iff it equals the fallback for
 * the SAME contact name; a rename to a value that happens to collide with the
 * fallback is a real edge case (rare — a staff member typing exactly what the
 * client already said) and is treated as generated, matching what
 * `currentInquiryName` itself would return for that inquiry either way.
 */
export function isGeneratedName(name: string, contactName: string): boolean {
  return name === fallbackName(contactName);
}
