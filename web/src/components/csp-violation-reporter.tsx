"use client";

import { useEffect } from "react";

/**
 * In development, logs Content Security Policy violations to the console so
 * third-party integrations (analytics, maps, etc.) can be debugged quickly.
 * Does not run in production builds.
 */
export function CspViolationReporter() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    function onCspViolation(ev: SecurityPolicyViolationEvent) {
      console.warn("[CSP violation]", {
        violatedDirective: ev.violatedDirective,
        effectiveDirective: ev.effectiveDirective,
        blockedURI: ev.blockedURI,
        disposition: ev.disposition,
        sourceFile: ev.sourceFile,
        lineNumber: ev.lineNumber,
        columnNumber: ev.columnNumber,
        sample: ev.sample,
      });
    }

    document.addEventListener("securitypolicyviolation", onCspViolation);
    return () =>
      document.removeEventListener("securitypolicyviolation", onCspViolation);
  }, []);

  return null;
}
