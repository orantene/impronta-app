/** User-facing copy for AI failures (quota, key, network). */
export function friendlyAiFailureMessage(message: string): string {
  const m = message.trim().toLowerCase();
  if (!m) return "AI unavailable — edit manually.";
  if (
    m.includes("openai") ||
    m.includes("api key") ||
    m.includes("not configured") ||
    m.includes("quota") ||
    m.includes("rate limit") ||
    m.includes("429") ||
    m.includes("network") ||
    m.includes("fetch failed") ||
    m.includes("econn") ||
    m.includes("enotfound") ||
    m.includes("socket") ||
    m.includes("timeout")
  ) {
    return "AI unavailable — edit manually.";
  }
  return message;
}
