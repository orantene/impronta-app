"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clientDirectoryHref } from "@/i18n/client-directory-href";
import {
  DIRECTORY_QUERY_DEBOUNCE_MS,
  commitDirectoryListingUrl,
} from "@/lib/directory/directory-url-navigation";
import {
  parseDirectoryQuery,
  serializeCanonicalDirectoryListingParams,
} from "@/lib/directory/search-params";
import { usePublicDiscoveryState } from "@/components/directory/public-discovery-state";

export type HeroSearchCopy = {
  placeholder: string;
  ariaLabel: string;
  searchSubmit: string;
  typedExamples: string[];
  /** Shown on the submit button while `/api/ai/interpret-search` runs. */
  interpreting?: string;
  /** Flash title when smart search fails (network or non-OK API response). */
  interpretErrorTitle?: string;
  /** Generic fallback when the model fails or the error code is unknown. */
  interpretError?: string;
  /** API returned `directory_unavailable` (directory not public). */
  interpretErrorDirectoryClosed?: string;
  /** API returned `ai_search_disabled`. */
  interpretErrorAiDisabled?: string;
  /** API returned `service_unavailable` or similar. */
  interpretErrorService?: string;
};

function flashForInterpretFailure(
  copy: HeroSearchCopy,
  apiErrorCode?: string,
): { title: string; message: string } {
  const title = copy.interpretErrorTitle?.trim() || "Search";
  const generic = copy.interpretError?.trim() || "Smart search is unavailable. Showing plain text results.";
  switch (apiErrorCode) {
    case "directory_unavailable":
      return {
        title,
        message: copy.interpretErrorDirectoryClosed?.trim() || generic,
      };
    case "ai_search_disabled":
      return {
        title,
        message: copy.interpretErrorAiDisabled?.trim() || generic,
      };
    case "service_unavailable":
      return {
        title,
        message: copy.interpretErrorService?.trim() || generic,
      };
    default:
      return { title, message: generic };
  }
}

type HeroSearchProps = {
  copy: HeroSearchCopy;
  /**
   * When true (directory page only): keep `q` in sync with the URL using debounced
   * `router.replace`, preserving other filters. Submit still commits immediately.
   */
  directoryUrlSync?: boolean;
  /** Server-parsed `q` for hydration (avoids empty flash before client reads searchParams). */
  initialDirectoryQuery?: string;
  /** When true, submit calls `/api/ai/interpret-search` before navigating (same gate as home: flags + directory public). */
  aiSearchEnabled?: boolean;
  locale?: "en" | "es";
};

export function HeroSearch({
  copy,
  directoryUrlSync = false,
  initialDirectoryQuery = "",
  aiSearchEnabled = false,
  locale = "en",
}: HeroSearchProps) {
  const { setFlash } = usePublicDiscoveryState();
  const examples = useMemo(
    () => (copy.typedExamples.length > 0 ? copy.typedExamples : [copy.placeholder]),
    [copy.placeholder, copy.typedExamples],
  );
  const [exampleIdx, setExampleIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [focused, setFocused] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchParamsRef = useRef(searchParams.toString());
  searchParamsRef.current = searchParams.toString();

  const urlQ = useMemo(
    () => parseDirectoryQuery(searchParams.get("q") ?? undefined),
    [searchParams],
  );

  const [draft, setDraft] = useState(() =>
    directoryUrlSync ? initialDirectoryQuery.trim() : "",
  );

  useEffect(() => {
    if (!directoryUrlSync) return;
    if (document.activeElement === inputRef.current) return;
    setDraft(urlQ);
  }, [directoryUrlSync, urlQ]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (directoryUrlSync || focused) return;
    const example = examples[exampleIdx % examples.length];
    let charIdx = 0;
    setTyped("");

    const typeInterval = setInterval(() => {
      if (charIdx < example.length) {
        setTyped(example.slice(0, charIdx + 1));
        charIdx++;
      } else {
        clearInterval(typeInterval);
        setTimeout(() => {
          setExampleIdx((prev) => (prev + 1) % examples.length);
        }, 2400);
      }
    }, 38);

    return () => clearInterval(typeInterval);
  }, [exampleIdx, focused, examples, directoryUrlSync]);

  const flushDebouncedUrl = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const scheduleUrlCommit = useCallback(
    (raw: string) => {
      if (!directoryUrlSync) return;
      flushDebouncedUrl();
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const trimmed = raw.trim();
        startTransition(() => {
          commitDirectoryListingUrl(router, pathname, searchParamsRef.current, (params) => {
            if (trimmed) params.set("q", trimmed);
            else params.delete("q");
          });
        });
      }, DIRECTORY_QUERY_DEBOUNCE_MS);
    },
    [directoryUrlSync, flushDebouncedUrl, router, pathname, startTransition],
  );

  const applyPlainDirectoryQuery = useCallback(
    (q: string) => {
      startTransition(() => {
        commitDirectoryListingUrl(router, pathname, searchParamsRef.current, (params) => {
          if (q) params.set("q", q);
          else params.delete("q");
        });
      });
    },
    [router, pathname, startTransition],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = directoryUrlSync
      ? draft.trim()
      : (inputRef.current?.value?.trim() ?? "");

    if (directoryUrlSync) {
      flushDebouncedUrl();
    }

    if (!q) {
      if (directoryUrlSync) {
        startTransition(() => {
          commitDirectoryListingUrl(router, pathname, searchParamsRef.current, (params) => {
            params.delete("q");
            params.delete("ai_sum");
          });
        });
      } else {
        router.push(clientDirectoryHref(pathname, ""));
      }
      return;
    }

    if (aiSearchEnabled) {
      setInterpreting(true);
      try {
        const res = await fetch("/api/ai/interpret-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, locale }),
        });

        let payload: unknown = null;
        try {
          payload = await res.json();
        } catch {
          payload = null;
        }

        const bodyObj = payload && typeof payload === "object" ? (payload as { error?: unknown }) : null;
        const bodyError =
          bodyObj && typeof bodyObj.error === "string" && bodyObj.error.trim() ? bodyObj.error.trim() : null;

        if (res.ok && bodyObj && !bodyError) {
          const data = payload as {
            taxonomyTermIds?: string[];
            locationSlug?: string;
            query?: string;
            normalizedSummary?: string;
            heightMinCm?: number | null;
            heightMaxCm?: number | null;
            ageMin?: number | null;
            ageMax?: number | null;
          };
          const tax = data.taxonomyTermIds ?? [];
          const loc = (data.locationSlug ?? "").trim();
          const qq = (data.query ?? q).trim();
          const sum = (data.normalizedSummary ?? "").trim();
          const hMin =
            typeof data.heightMinCm === "number" && Number.isFinite(data.heightMinCm)
              ? data.heightMinCm
              : null;
          const hMax =
            typeof data.heightMaxCm === "number" && Number.isFinite(data.heightMaxCm)
              ? data.heightMaxCm
              : null;
          const aMin =
            typeof data.ageMin === "number" && Number.isFinite(data.ageMin)
              ? data.ageMin
              : null;
          const aMax =
            typeof data.ageMax === "number" && Number.isFinite(data.ageMax)
              ? data.ageMax
              : null;
          if (directoryUrlSync) {
            startTransition(() => {
              commitDirectoryListingUrl(router, pathname, searchParamsRef.current, (params) => {
                params.delete("tax");
                params.delete("location");
                params.delete("q");
                params.delete("ai_sum");
                params.delete("hmin");
                params.delete("hmax");
                params.delete("amin");
                params.delete("amax");
                if (tax.length) params.set("tax", [...tax].sort().join(","));
                if (loc) params.set("location", loc);
                if (qq) params.set("q", qq);
                if (sum) params.set("ai_sum", sum.slice(0, 400));
                if (hMin != null) params.set("hmin", String(hMin));
                if (hMax != null) params.set("hmax", String(hMax));
                if (aMin != null) params.set("amin", String(aMin));
                if (aMax != null) params.set("amax", String(aMax));
              });
            });
          } else {
            const qs = serializeCanonicalDirectoryListingParams({
              query: qq,
              locationSlug: loc,
              taxonomyTermIds: tax,
              heightMinCm: hMin,
              heightMaxCm: hMax,
              ageMin: aMin,
              ageMax: aMax,
              aiSummary: sum,
            });
            router.push(clientDirectoryHref(pathname, qs ? `?${qs}` : ""));
          }
          return;
        }

        const errCode = bodyError ?? undefined;
        const { title, message } = flashForInterpretFailure(copy, errCode);
        setFlash({ tone: "error", title, message });
        if (directoryUrlSync) {
          applyPlainDirectoryQuery(q);
        } else {
          router.push(clientDirectoryHref(pathname, `?q=${encodeURIComponent(q)}`));
        }
        return;
      } catch {
        const { title, message } = flashForInterpretFailure(copy);
        setFlash({ tone: "error", title, message });
        if (directoryUrlSync) {
          applyPlainDirectoryQuery(q);
        } else {
          router.push(clientDirectoryHref(pathname, `?q=${encodeURIComponent(q)}`));
        }
        return;
      } finally {
        setInterpreting(false);
      }
    }

    if (directoryUrlSync) {
      applyPlainDirectoryQuery(q);
      return;
    }
    router.push(clientDirectoryHref(pathname, `?q=${encodeURIComponent(q)}`));
  }

  const showTypewriter = !directoryUrlSync && !focused;
  const submitLabel = interpreting ? copy.interpreting ?? copy.searchSubmit : copy.searchSubmit;

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-2xl">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[var(--impronta-gold-dim)]" />
        <input
          ref={inputRef}
          type="text"
          className="h-14 w-full rounded-xl border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] pl-12 pr-28 text-base text-foreground placeholder:text-transparent outline-none transition-colors focus:border-[var(--impronta-gold)] focus:ring-1 focus:ring-[var(--impronta-gold)]/30 sm:h-16 sm:text-lg"
          placeholder={copy.placeholder}
          aria-label={copy.ariaLabel}
          disabled={interpreting}
          {...(directoryUrlSync
            ? {
                value: draft,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  setDraft(e.target.value);
                  scheduleUrlCommit(e.target.value);
                },
              }
            : {})}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            if (!e.target.value) setFocused(false);
          }}
        />
        {showTypewriter && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-12 top-1/2 -translate-y-1/2 text-base text-[var(--impronta-muted)] sm:text-lg"
          >
            {typed}
            <motion.span
              className="inline-block w-[2px] bg-[var(--impronta-gold)] align-middle"
              style={{ height: "1.1em" }}
              animate={{ opacity: [1, 0] }}
              transition={{ repeat: Infinity, duration: 0.7 }}
            />
          </span>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={interpreting}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg"
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
