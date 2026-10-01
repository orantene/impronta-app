/**
 * Nail Designer: how a nail is painted. Ported verbatim from the reference
 * board's `patternBg`, `SHINE` and `hexA`. The gradients paint the POLISH.
 */
import type { NailState } from "./nail-designer-model";

export const NAIL_SHINE: Record<string, string> = {
  gloss:
    "linear-gradient(105deg, rgba(255,255,255,0) 20%, rgba(255,255,255,.55) 27%, rgba(255,255,255,0) 38%), radial-gradient(70% 30% at 50% 6%, rgba(255,255,255,.35), rgba(255,255,255,0) 70%)",
  matte: "linear-gradient(rgba(255,255,255,.14), rgba(255,255,255,.04))",
  chrome:
    "linear-gradient(115deg, rgba(255,255,255,.1) 5%, rgba(255,255,255,.85) 26%, rgba(0,0,0,.28) 46%, rgba(255,255,255,.65) 66%, rgba(0,0,0,.18) 88%)",
  glitter:
    "radial-gradient(circle at 30% 30%, rgba(255,255,255,.95) 0 0.8px, rgba(255,255,255,0) 1.6px) 0 0 / 7px 9px, radial-gradient(circle at 60% 70%, rgba(255,255,255,.75) 0 0.8px, rgba(255,255,255,0) 1.6px) 0 0 / 11px 6px, radial-gradient(circle at 50% 50%, rgba(255,226,150,.85) 0 0.7px, rgba(255,226,150,0) 1.4px) 0 0 / 5px 13px, linear-gradient(105deg, rgba(255,255,255,0) 20%, rgba(255,255,255,.4) 27%, rgba(255,255,255,0) 38%)",
  pearl:
    "linear-gradient(140deg, rgba(255,235,248,.55), rgba(205,232,255,.35) 45%, rgba(255,250,235,.5) 75%, rgba(255,255,255,.25)), linear-gradient(105deg, rgba(255,255,255,0) 22%, rgba(255,255,255,.45) 28%, rgba(255,255,255,0) 38%)",
};

export function nailShine(finish: string): string {
  return NAIL_SHINE[finish] ?? NAIL_SHINE.gloss;
}

export function hexA(hex: string, a: number): string {
  const n = parseInt(String(hex).slice(1, 7), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Background for one nail's art. `s` shrinks repeat sizes for thumbnails. */
export function nailPatternBg(n: Pick<NailState, "c1" | "c2" | "pattern">, s: number): string {
  const a = n.c1;
  const b = n.c2;
  const d = Math.max(6, Math.round(12 * s));
  const h = Math.round(d * 0.55);
  switch (n.pattern) {
    case "french":
      return `radial-gradient(130% 80% at 50% 96%, ${a} 78%, ${b} 79%)`;
    case "ombre":
      return `linear-gradient(to top, ${a} 8%, ${b} 92%)`;
    case "dots":
      return `radial-gradient(circle, ${b} 0 22%, ${hexA(b, 0)} 26%) 0 0 / ${d}px ${d}px, ${a}`;
    case "stripes":
      return `repeating-linear-gradient(135deg, ${a} 0 ${h}px, ${b} ${h}px ${d}px)`;
    case "moon":
      return `radial-gradient(58% 30% at 50% 100%, ${b} 97%, ${a} 100%)`;
    case "check":
      return `conic-gradient(${b} 25%, ${a} 0 50%, ${b} 0 75%, ${a} 0) 0 0 / ${d}px ${d}px`;
    case "marble":
      return `linear-gradient(155deg, ${hexA(b, 0)} 38%, ${hexA(b, 0.7)} 42%, ${hexA(b, 0)} 47%), linear-gradient(35deg, ${hexA(b, 0)} 58%, ${hexA(b, 0.5)} 61%, ${hexA(b, 0)} 65%), radial-gradient(45% 35% at 30% 30%, ${hexA(b, 0.45)}, ${hexA(b, 0)} 70%), ${a}`;
    default:
      return a;
  }
}
