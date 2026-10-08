"use client";

import { useEffect } from "react";

import { onAnalyticsGranted } from "@/lib/analytics/consent";
import type { TrackingTag } from "@/lib/site-admin/tracking";

/**
 * Ad pixels a tenant connected (Meta). They are NOT in the server HTML: they
 * are injected here only after the visitor accepts the consent banner, on this
 * visit or a later one. Tags arrive already validated by selectTrackingForRender.
 */
export function GatedTrackingScripts({ tags }: { tags: TrackingTag[] }) {
  useEffect(() => {
    return onAnalyticsGranted(() => {
      for (const tag of tags) {
        const id = `tenant-tracking-${tag.key}`;
        if (document.getElementById(id)) continue;
        const el = document.createElement("script");
        el.id = id;
        el.setAttribute("data-tenant-tracking", tag.provider);
        if (tag.src) {
          el.src = tag.src;
          el.async = tag.loading === "async";
          el.defer = tag.loading === "defer";
          for (const [k, v] of Object.entries(tag.attrs ?? {})) el.setAttribute(k, v);
        } else {
          el.text = tag.code ?? "";
        }
        document.head.appendChild(el);
      }
    });
  }, [tags]);
  return null;
}
