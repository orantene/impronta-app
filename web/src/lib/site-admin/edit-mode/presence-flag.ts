/**
 * Runtime flag — live multiplayer presence UI in the builder (WS1-A).
 *
 * DEFAULT OFF. When unset / not exactly `"1"` or `"true"`, the builder behaves
 * exactly as today: the `PresenceProvider` still tracks presence over Realtime
 * (it always has), but NONE of the new presence UI renders — no topbar
 * collaborator avatars, no "others editing" banner, no editor-named conflict.
 *
 * Only when `NEXT_PUBLIC_BUILDER_PRESENCE` is explicitly enabled do those
 * surfaces light up. `NEXT_PUBLIC_*` is inlined at build time, so this reads
 * identically everywhere.
 */
export function isBuilderPresenceEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_BUILDER_PRESENCE;
  return raw === "1" || raw === "true";
}
