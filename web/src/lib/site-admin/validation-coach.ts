/**
 * Rewrite Zod's default messages into admin-friendly language.
 *
 * The Zod defaults speak programmer ("Expected string, received
 * undefined at path .items.0.title"). Admins don't parse "path .items.0"
 * naturally. This helper maps common Zod patterns to coached copy,
 * preserving the field path so the UI can still anchor the message to
 * a specific input.
 *
 * Usage in server actions:
 *   const parsed = schema.safeParse(values);
 *   if (!parsed.success) {
 *     return {
 *       ok: false,
 *       error: "Some fields need attention.",
 *       fieldErrors: coachZodFieldErrors(parsed.error),
 *     };
 *   }
 */

export interface ZodIssueLike {
  path: ReadonlyArray<PropertyKey>;
  message: string;
  code?: string;
}

export interface ZodErrorLike {
  issues: ReadonlyArray<ZodIssueLike>;
}

/**
 * Turn a dot-path into a human-friendly field label.
 *   items.0.title → "Item 1 — Title"
 *   slots.hero.0 → "Slot “Hero” item 1"
 *   headline → "Headline"
 */
export function humanizeFieldPath(path: ReadonlyArray<PropertyKey>): string {
  if (path.length === 0) return "This field";
  const parts: string[] = [];
  for (let i = 0; i < path.length; i += 1) {
    const segment = path[i];
    const next = path[i + 1];
    if (typeof segment === "string" && typeof next === "number") {
      // Collection entry: "items" + 0 → "Item 1"
      const singular = segment.replace(/s$/, "");
      const noun =
        singular.charAt(0).toUpperCase() +
        singular.slice(1).replace(/[_-]/g, " ");
      parts.push(`${noun} ${next + 1}`);
      i += 1; // consume the numeric segment
      continue;
    }
    if (typeof segment === "number") {
      // standalone number (unusual)
      parts.push(`#${segment + 1}`);
      continue;
    }
    const label = String(segment)
      .replace(/[_-]/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (c) => c.toUpperCase());
    parts.push(label);
  }
  return parts.join(" — ");
}

/**
 * Coach a single Zod message + path into admin-friendly copy. Falls
 * through to the original message when no pattern matches, so new Zod
 * shapes don't regress into "[object Object]" or empty strings.
 */
export function coachZodMessage(
  rawMessage: string,
  path: ReadonlyArray<PropertyKey>,
): string {
  const field = humanizeFieldPath(path);
  const msg = rawMessage.trim();

  // Required / missing
  if (
    /^required$/i.test(msg) ||
    /expected string, received undefined/i.test(msg) ||
    /expected number, received undefined/i.test(msg) ||
    /received undefined/i.test(msg)
  ) {
    return `${field} is required.`;
  }

  // Empty string → treat as missing
  if (/string must contain at least 1 character/i.test(msg)) {
    return `${field} can't be empty.`;
  }

  // Length ranges
  const atMostMatch = msg.match(
    /String must contain at most (\d+) character/i,
  );
  if (atMostMatch) {
    return `${field} can't be longer than ${atMostMatch[1]} characters.`;
  }
  const atLeastMatch = msg.match(
    /String must contain at least (\d+) character/i,
  );
  if (atLeastMatch) {
    return `${field} should be at least ${atLeastMatch[1]} characters.`;
  }

  // Array bounds
  const arrAtMost = msg.match(/Array must contain at most (\d+) element/i);
  if (arrAtMost) {
    return `${field} has too many items — the limit is ${arrAtMost[1]}.`;
  }
  const arrAtLeast = msg.match(/Array must contain at least (\d+) element/i);
  if (arrAtLeast) {
    return `${field} needs at least ${arrAtLeast[1]} item${arrAtLeast[1] === "1" ? "" : "s"}.`;
  }

  // Enum
  if (/invalid enum value/i.test(msg)) {
    return `${field} isn't a recognized option. Pick one from the list.`;
  }

  // URL / email / uuid
  if (/invalid url/i.test(msg)) {
    return `${field} should be a full URL (starts with https://).`;
  }
  if (/invalid email/i.test(msg)) {
    return `${field} should be a valid email address.`;
  }
  if (/invalid uuid/i.test(msg)) {
    return `${field} isn't a valid identifier — reload and try again.`;
  }

  // Number ranges
  const gteMatch = msg.match(
    /Number must be greater than or equal to (-?\d+(?:\.\d+)?)/i,
  );
  if (gteMatch) {
    return `${field} must be ${gteMatch[1]} or more.`;
  }
  const lteMatch = msg.match(
    /Number must be less than or equal to (-?\d+(?:\.\d+)?)/i,
  );
  if (lteMatch) {
    return `${field} must be ${lteMatch[1]} or less.`;
  }
  if (/expected number/i.test(msg)) {
    return `${field} should be a number.`;
  }
  if (/expected integer/i.test(msg) || /not a whole number/i.test(msg)) {
    return `${field} should be a whole number.`;
  }

  // Boolean
  if (/expected boolean/i.test(msg)) {
    return `${field} should be true or false.`;
  }

  // Fallback: lead with the field name so admins know where to look.
  if (msg.length > 0 && !msg.startsWith(field)) {
    return `${field} — ${msg}`;
  }
  return msg || `${field} has an issue.`;
}

export function coachZodFieldErrors(
  error: ZodErrorLike,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map((p) => String(p)).join(".") || "_form";
    if (out[key]) continue; // first message wins
    out[key] = coachZodMessage(issue.message, issue.path);
  }
  return out;
}
