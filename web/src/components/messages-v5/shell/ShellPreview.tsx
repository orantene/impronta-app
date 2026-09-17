"use client";

/**
 * ShellPreview (dev only): the Messages v5 shell on fixture data at 390,
 * 1194 and 1440, one frame per width, each measuring itself so the three
 * layouts (one column, two columns + drawer, three columns) show at once.
 * Route: /c/t/preview?screen=shell (non-production only). Nothing here
 * reads a tenant; writes mutate the fixture engine in memory.
 */

import { useMemo } from "react";

import { FIXTURE_TENANT } from "@/lib/messaging/fixture";

import { fixtureShellEngine } from "./fixture-engine";
import { MessagesV5Shell } from "./MessagesV5Shell";

const WIDTHS = [1440, 1194, 390] as const;

export function ShellPreview({ widths = WIDTHS, initialInquiryId = "inq-visitor" }: { widths?: readonly (390 | 1194 | 1440)[]; initialInquiryId?: string | null }) {
  const engines = useMemo(() => Object.fromEntries(widths.map((w) => [w, fixtureShellEngine()])) as Record<number, ReturnType<typeof fixtureShellEngine>>, [widths]);
  return (
    <div className="msgv5 shell-preview" data-shell-preview>
      {widths.map((width) => (
        <div key={width} className="kit-widths">
          <div className={`kit-w shell-frame w${width}`} data-shell-width={width}>
            <span className="kit-cap">{width}</span>
            <MessagesV5Shell tenantId={FIXTURE_TENANT} tenantSlug="fixture" currentUserId="user-ana" workspaceType={width === 1194 ? "talent" : "business"} engine={engines[width]} forceWidth={width} live={false} initialInquiryId={initialInquiryId} />
          </div>
        </div>
      ))}
    </div>
  );
}
