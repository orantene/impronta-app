import { fashionDirectoryPreset } from "./presets";
import { directorySchemaV1, type DirectoryV1 } from "./schema";

export function normalizeDirectoryProps(raw: Partial<DirectoryV1> | null | undefined): DirectoryV1 {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const parsed = directorySchemaV1.safeParse(source);
  if (parsed.success) return parsed.data;

  const sourceWithDefinedValues = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  );
  const fallback = directorySchemaV1.safeParse({
    ...fashionDirectoryPreset,
    ...sourceWithDefinedValues,
  });

  return fallback.success ? fallback.data : fashionDirectoryPreset;
}
