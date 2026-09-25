/** Local-only Discover networks seed. Never written to production tables. */

export type LocalNetwork = {
  id: string;
  name: string;
  city: string;
  access: "open" | "apply" | "invite";
  fee: string;
  summary: string;
};

export const LOCAL_NETWORKS: LocalNetwork[] = [
  {
    id: "local-cancun-beauty",
    name: "Cancún Beauty Collective",
    city: "Cancún and the hotel zone",
    access: "open",
    fee: "No membership fee",
    summary: "Nails, lashes, brows, hair, make-up",
  },
  {
    id: "local-riviera-makers",
    name: "Riviera Makers",
    city: "Playa del Carmen",
    access: "apply",
    fee: "Review only",
    summary: "Independent makers who take bookings in person",
  },
];

export type LocalNetworkState = "none" | "joined" | "pending" | "hidden";

const KEY = "talent-studio-local-networks";

function read(talentId: string): Record<string, LocalNetworkState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`${KEY}:${talentId}`);
    return raw ? (JSON.parse(raw) as Record<string, LocalNetworkState>) : {};
  } catch {
    return {};
  }
}

function write(talentId: string, map: Record<string, LocalNetworkState>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${KEY}:${talentId}`, JSON.stringify(map));
}

export function networkState(talentId: string, networkId: string): LocalNetworkState {
  return read(talentId)[networkId] ?? "none";
}

export function setNetworkState(talentId: string, networkId: string, state: LocalNetworkState) {
  const map = read(talentId);
  if (state === "none") delete map[networkId];
  else map[networkId] = state;
  write(talentId, map);
}
