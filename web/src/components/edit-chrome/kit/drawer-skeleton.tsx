"use client";

import { CHROME } from "./tokens";

interface DrawerSkeletonProps {
  rows?: number;
  className?: string;
}

export function DrawerSkeleton({
  rows = 4,
  className,
}: DrawerSkeletonProps) {
  return (
    <div
      className={`flex flex-col gap-2 ${className ?? ""}`}
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg"
          style={{
            height: 64,
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            opacity: Math.max(0.15, 0.55 - i * 0.1),
          }}
        />
      ))}
    </div>
  );
}

export function DrawerSkeletonGrid({
  rows = 6,
  className,
}: DrawerSkeletonProps) {
  return (
    <div
      className={`grid gap-2.5 ${className ?? ""}`}
      aria-busy="true"
      aria-label="Loading"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg"
          style={{
            aspectRatio: "1 / 1.18",
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            opacity: 0.55,
          }}
        />
      ))}
    </div>
  );
}
