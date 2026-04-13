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
import { parseDirectoryQuery } from "@/lib/directory/search-params";

export type HeroSearchCopy = {
  placeholder: string;
  ariaLabel: string;
  searchSubmit: string;
  typedExamples: string[];
};

type HeroSearchProps = {
  copy: HeroSearchCopy;
  /**
   * When true (directory page only): keep `q` in sync with the URL using debounced
   * `router.replace`, preserving other filters. Submit still commits immediately.
   */
  directoryUrlSync?: boolean;
  /** Server-parsed `q` for hydration (avoids empty flash before client reads searchParams). */
  initialDirectoryQuery?: string;
};

export function HeroSearch({
  copy,
  directoryUrlSync = false,
  initialDirectoryQuery = "",
}: HeroSearchProps) {
  const examples = useMemo(
    () => (copy.typedExamples.length > 0 ? copy.typedExamples : [copy.placeholder]),
    [copy.placeholder, copy.typedExamples],
  );
  const [exampleIdx, setExampleIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [focused, setFocused] = useState(false);
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = directoryUrlSync
      ? draft.trim()
      : (inputRef.current?.value?.trim() ?? "");
    if (directoryUrlSync) {
      flushDebouncedUrl();
      startTransition(() => {
        commitDirectoryListingUrl(router, pathname, searchParamsRef.current, (params) => {
          if (q) params.set("q", q);
          else params.delete("q");
        });
      });
      return;
    }
    if (q) {
      router.push(clientDirectoryHref(pathname, `?q=${encodeURIComponent(q)}`));
    } else {
      router.push(clientDirectoryHref(pathname, ""));
    }
  }

  const showTypewriter = !directoryUrlSync && !focused;

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
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg"
        >
          {copy.searchSubmit}
        </Button>
      </div>
    </form>
  );
}
