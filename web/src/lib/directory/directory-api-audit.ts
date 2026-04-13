/** Opt-in timing logs for `/api/directory` performance audits. Set `DIRECTORY_API_AUDIT=1`. */
export function isDirectoryApiAudit(): boolean {
  return process.env.DIRECTORY_API_AUDIT === "1";
}

export async function auditTime<T>(
  enabled: boolean,
  bucket: Record<string, number>,
  key: string,
  fn: () => PromiseLike<T>,
): Promise<T> {
  if (!enabled) return Promise.resolve(fn()) as Promise<T>;
  const s = performance.now();
  try {
    return await Promise.resolve(fn());
  } finally {
    bucket[key] = (bucket[key] ?? 0) + (performance.now() - s);
  }
}
