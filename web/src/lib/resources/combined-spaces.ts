/**
 * Combined spaces as declared exclusive relationships.
 *
 * Hall A + Hall B cannot invent capacity the room lacks: activating the
 * combined layout marks the component spaces busy for the same window.
 */

export type SpaceExclusiveEdge = {
  /** The combined / parent space id. */
  combinedSpaceId: string;
  /** Component space that cannot be sold separately while the combined is held. */
  componentSpaceId: string;
};

export type CombinedSpaceGraph = {
  edges: readonly SpaceExclusiveEdge[];
};

/** Every space that must be held when `spaceId` is reserved (including itself). */
export function exclusiveClosure(
  graph: CombinedSpaceGraph,
  spaceId: string,
): string[] {
  const out = new Set<string>([spaceId]);
  for (const edge of graph.edges) {
    if (edge.combinedSpaceId === spaceId) out.add(edge.componentSpaceId);
    if (edge.componentSpaceId === spaceId) out.add(edge.combinedSpaceId);
  }
  // One more hop so A+B and A agree when B is held via the combined node.
  for (const edge of graph.edges) {
    if (out.has(edge.combinedSpaceId)) out.add(edge.componentSpaceId);
    if (out.has(edge.componentSpaceId)) out.add(edge.combinedSpaceId);
  }
  return [...out].sort();
}

/**
 * A second layout invents capacity when its bookable markers exceed the
 * physical room's units. Refuse that configuration.
 */
export function layoutInventoriesCapacity(input: {
  physicalUnits: number;
  layoutBookableMarkers: number;
}): { ok: true } | { ok: false; error: string } {
  if (input.layoutBookableMarkers > input.physicalUnits) {
    return {
      ok: false,
      error: `This layout marks ${input.layoutBookableMarkers} bookable places but the room only has ${input.physicalUnits}.`,
    };
  }
  return { ok: true };
}
