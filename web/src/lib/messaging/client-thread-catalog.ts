/**
 * TUL-693 / TUL-954: the message subtrees the guest thread renders, picked on
 * the server for the thread locale (plus English as the per-key fallback) and
 * handed to `ClientThread` as a prop. See `bundle-translator.ts` for why.
 */

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import fr from "../../../messages/fr.json";

import { catalogCodeFor, type ClientThreadCatalog } from "@/components/messages-v5/client/bundle-translator";

type Node = Record<string, unknown>;

/** Dot paths the thread (and the kit copy it builds) reads. */
export const CLIENT_THREAD_CATALOG_PATHS = [
  "dashboard.messagesV5",
  "public.guestChat",
  "public.clientAccount",
  "public.thread",
] as const;

const CATALOGS: Record<string, Node> = { en: en as Node, es: es as Node, fr: fr as Node };

function pick(catalog: Node): Node {
  const out: Node = {};
  for (const path of CLIENT_THREAD_CATALOG_PATHS) {
    const parts = path.split(".");
    let src: unknown = catalog;
    for (const p of parts) src = src && typeof src === "object" ? (src as Node)[p] : undefined;
    if (src === undefined) continue;
    let dst = out;
    for (const p of parts.slice(0, -1)) dst = (dst[p] ??= {}) as Node;
    dst[parts[parts.length - 1]] = src;
  }
  return out;
}

export function clientThreadCatalog(locale: string): ClientThreadCatalog {
  const code = catalogCodeFor(locale);
  const out: Record<string, Node> = {};
  for (const c of new Set([code, "en"])) if (CATALOGS[c]) out[c] = pick(CATALOGS[c]);
  return out;
}
