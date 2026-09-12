import type { WorkspaceClientRow, WorkspaceTeamMember as BridgeTeamMember } from "../data-bridge";
import type { Client, ClientTrustLevel, Role, TeamMember } from "./types";

/**
 * Bridge row -> prototype-shell row adapters for the client and team lists.
 * Pure; moved out of context.tsx (which is on the file-size ratchet) when the
 * lazy-slice wait landed there.
 */

/** Adapt WorkspaceClientRow → Client (proto shell's client type). */
export function adaptBridgeClient(w: WorkspaceClientRow): Client {
  return {
    id: w.id,
    name: w.company ?? w.name,
    contact: w.name,
    bookingsYTD: w.bookingsYTD,
    status: w.accountStatus === "suspended" ? "dormant" : "active",
    trust: (w.trustLevel ?? "basic") as ClientTrustLevel,
  };
}

/** Adapt BridgeTeamMember → TeamMember (proto shell's team type). */
export function adaptBridgeTeamMember(m: BridgeTeamMember): TeamMember {
  const words = m.name.trim().split(/\s+/);
  const initials = words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : m.name.slice(0, 2).toUpperCase();
  return {
    id: m.id,
    name: m.name,
    // Email comes from `auth.users` via the bridge loader's service-role
    // lookup (`public.profiles` carries none) — may still be empty if
    // the lookup failed.
    email: m.email ?? "",
    photoUrl: m.photoUrl,
    role: (["viewer","editor","manager","admin","owner"].includes(m.role) ? m.role : "viewer") as Role,
    status: m.status === "pending_acceptance" ? "invited" : "active",
    initials,
  };
}

