import "server-only";

import { logServerError } from "@/lib/server/safe-error";

export type WorkerCommand = "pair" | "logout" | "pairing-code";

export type WorkerCallResult = { ok: true } | { ok: false; reason: "unavailable" };

/**
 * App → channel-worker control plane. The worker is optional in local/dev:
 * pairing still writes `channel_connections.state='pairing'` so a later
 * worker boot picks the row up. A missing URL is not an error for the UI.
 */
export async function callChannelWorker(
  command: WorkerCommand,
  body: Record<string, unknown>,
): Promise<WorkerCallResult> {
  const url = process.env.CHANNEL_WORKER_URL?.replace(/\/$/, "");
  const token = process.env.CHANNEL_WORKER_TOKEN;
  if (!url || !token) return { ok: false, reason: "unavailable" };
  try {
    const res = await fetch(`${url}/${command}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, reason: "unavailable" };
    return { ok: true };
  } catch (err) {
    logServerError("channels.worker", err);
    return { ok: false, reason: "unavailable" };
  }
}
