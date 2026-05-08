import type { WatermarkPreset } from "./admin-workspace-settings";

export const DEFAULT_WATERMARK_PRESET: WatermarkPreset = {
  enabled: false,
  position: "br",
  size_pct: 12,
  opacity: 0.6,
  padding_pct: 4,
  variant: "light",
};
