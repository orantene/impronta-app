/** "inquiry-workspace" → "Inquiry workspace"; "support.live-chat" → "Live chat". Client-safe (no server imports). */
export function humanizeNodeId(id: string): string {
  const last = id.split(".").pop() ?? id;
  const words = last.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
