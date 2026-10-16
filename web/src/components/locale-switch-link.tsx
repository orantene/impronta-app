"use client";

import type { ComponentPropsWithoutRef } from "react";
import { useLocationHash, withLocationHash } from "@/i18n/use-location-hash";

/**
 * Plain `<a>` for locale switches that must keep the current section hash
 * (E3-J8-anchor). Server-rendered footers pass a path-only href; the hash is
 * filled in on the client.
 */
export function LocaleSwitchLink({
  href,
  ...rest
}: ComponentPropsWithoutRef<"a"> & { href: string }) {
  const hash = useLocationHash();
  return <a href={withLocationHash(href, hash)} {...rest} />;
}
