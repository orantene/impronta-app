"use client";

import { useLayoutEffect } from "react";

import { buildHtmlTokenVarsCss, pickHtmlTokenAttrs } from "@/lib/talent-site/html-token-vars";

/**
 * Publishes the talent site's design tokens on <html> so platform UI that is a
 * sibling of `[data-talent-max-site]` (messages dock, socket, client account
 * chrome) inherits them. Additive: the root div keeps its own copy.
 *
 * - CSS vars: a server-rendered `<style>` (`html{...}`), present in the first
 *   HTML so there is no flash; removed with the page on client navigation.
 * - `data-token-*` attributes: set on <html> after hydration (a layout effect
 *   cannot run during SSR; the root layout owns the <html> element) and
 *   restored on unmount.
 */
export function TalentSiteHtmlTokens({
  cssVars,
  dataAttrs,
}: {
  cssVars: Record<string, string>;
  dataAttrs: Record<string, string>;
}) {
  const css = buildHtmlTokenVarsCss(cssVars);
  const attrKey = JSON.stringify(pickHtmlTokenAttrs(dataAttrs));

  useLayoutEffect(() => {
    const attrs = JSON.parse(attrKey) as Record<string, string>;
    const root = document.documentElement;
    const previous = new Map<string, string | null>();
    for (const [name, value] of Object.entries(attrs)) {
      previous.set(name, root.getAttribute(name));
      root.setAttribute(name, value);
    }
    return () => {
      for (const [name, prev] of previous) {
        if (prev === null) root.removeAttribute(name);
        else root.setAttribute(name, prev);
      }
    };
  }, [attrKey]);

  if (!css) return null;
  return <style data-talent-html-tokens="" dangerouslySetInnerHTML={{ __html: css }} />;
}
