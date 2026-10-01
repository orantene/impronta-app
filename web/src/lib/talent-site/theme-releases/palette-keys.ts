/** Release item key of a palette colour: `palette:<paletteKey>:<token>`. Pure, no imports. */
export function paletteItemKey(palette: string, token: string): string {
  return `palette:${palette}:${token}`;
}

export function parsePaletteItemKey(key: string): { palette: string; token: string } | null {
  const m = /^palette:([^:]+):(.+)$/.exec(key);
  return m ? { palette: m[1]!, token: m[2]! } : null;
}
