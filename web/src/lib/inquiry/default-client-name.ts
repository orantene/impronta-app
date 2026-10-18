/**
 * TUL-965: the name a signed-in client's inquiry drawer starts with.
 *
 * Client sign-up does not collect a name, so a real account can have none. The
 * drawer then showed an empty Nombre and 'Falta: tu nombre' with Review
 * disabled, a dead end for someone already signed in. A neutral label from the
 * email's local part ('maria.lopez@x.com' -> 'Maria Lopez') keeps the form
 * sendable; the field stays visible and editable, and the booking path already
 * falls back to the email the same way. A stored name always wins.
 */
export function defaultClientName(
  name: string | null | undefined,
  email: string | null | undefined,
): string | undefined {
  const given = name?.trim();
  if (given) return given;
  const local = (email ?? "").split("@")[0]?.trim() ?? "";
  if (!local || !(email ?? "").includes("@")) return undefined;
  const words = local
    .replace(/\+.*$/, "")
    .split(/[._\-\s]+/)
    .filter((w) => /[a-zA-ZÀ-ɏ]/.test(w))
    .map((w) => w.replace(/\d+$/, ""))
    .filter(Boolean);
  if (words.length === 0) return undefined;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
