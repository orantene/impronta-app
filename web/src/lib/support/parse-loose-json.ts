/**
 * Tolerant JSON parse for model output.
 *
 * Models sometimes wrap JSON in prose or a ```json fence even under a strict
 * schema. A bare JSON.parse turns that into a silent skip: the support
 * insights cron produced nothing for every ticket and the weekly digest
 * quietly fell back to mechanical copy, with no signal either way.
 */
export function parseLooseJson<T>(text: string): T | null {
  const attempt = (raw: string): T | null => {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };
  const trimmed = text.trim();
  const direct = attempt(trimmed);
  if (direct) return direct;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = attempt(fenced[1].trim());
    if (parsed) return parsed;
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) return attempt(trimmed.slice(first, last + 1));
  return null;
}
