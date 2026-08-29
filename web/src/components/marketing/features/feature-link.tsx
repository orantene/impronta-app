"use client";

import * as React from "react";
import { withLocaleHref } from "@/i18n/pathnames";
import type { FeatureKey } from "@/lib/marketing/features";
import { useFeatureHub } from "./feature-hub";

/**
 * A feature named inside a sentence.
 *
 * This is a real anchor to the feature's page, not a button dressed as one.
 * Script intercepts a plain left click to open the popup, so a reader can
 * check what something is and carry on reading, while a crawler, a middle
 * click, a modifier click and anyone without script all get the page. Content
 * therefore never exists only inside a popup, which is what keeps the whole
 * cross-linking mechanic safe for search.
 */
export function FeatureLink({
  featureKey,
  path,
  locale,
  children,
}: {
  featureKey: FeatureKey;
  /** Unprefixed path for this feature, resolved by the server renderer. */
  path: string;
  locale: string;
  children: React.ReactNode;
}) {
  const { open } = useFeatureHub();

  return (
    <a
      href={withLocaleHref(path, locale)}
      onClick={(e) => {
        // Let the browser do its normal thing for open in new tab, download,
        // and anything that is not a plain primary click.
        if (e.defaultPrevented) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        open(featureKey, "prose");
      }}
      className="underline decoration-dotted underline-offset-[3px] transition-colors hover:opacity-80"
      style={{ color: "var(--plt-forest)" }}
    >
      {children}
    </a>
  );
}
