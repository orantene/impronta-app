"use client";

import { seedInitialClients, type InitialClients } from "@/lib/talent/clients-initial";

/** Renders nothing; seeds the shell's Clients page before its first effect. */
export function ClientsInitialSeed({
  talentId,
  initial,
}: {
  talentId: string;
  initial: InitialClients;
}) {
  seedInitialClients(talentId, initial);
  return null;
}
