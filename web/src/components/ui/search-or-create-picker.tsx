"use client";

/**
 * SearchOrCreatePicker — one implementation of the contract every blueprint
 * repeats.
 *
 * The decisions that can be got wrong are in `@/lib/picker/machine`, with
 * tests. What is here is the three things a reducer cannot hold: the DOM, the
 * async calls, and the two structural promises below.
 *
 * PROMISE 1 — THE PARENT DRAFT SURVIVES. This is a Dialog rendered INSIDE the
 * parent's tree, not a route and not a portal to a different page. The parent
 * form keeps its state because it is never unmounted, which is the only
 * mechanism that actually works: "remember the draft in localStorage before
 * navigating" has been tried in this repo and loses the half of the state that
 * is not serialisable. `picker-wiring.static.test.ts` asserts this file never
 * imports the router, because a single `router.push` in a "create" branch
 * silently reintroduces the whole failure.
 *
 * PROMISE 2 — FOCUS COMES BACK TO THE TRIGGER. Free, and deliberately free:
 * Radix's Dialog restores focus to whatever opened it. Every hand-rolled
 * picker in this repo drops focus to `<body>` on close, which sends a keyboard
 * operator back to the top of a long form.
 *
 * THE CREATE CONTROL IS NEVER HIDDEN, only demoted. When the query exactly
 * matches an existing row the create button moves below the list and says what
 * it would duplicate — because an operator who genuinely needs a second
 * "Table 4" and cannot make one here will make it somewhere else, and that is
 * how a picker stops being the place objects come from.
 *
 * SEARCH IS DEBOUNCED, CREATE IS NOT. A keystroke is cheap to be wrong about;
 * a create is not. The create path fires exactly when pressed, guarded by the
 * machine's in-flight refusal and the idempotency key.
 */

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  canCreate,
  exactMatch,
  initialPickerState,
  pickerReducer,
  type PickerOption,
} from "@/lib/picker/machine";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 220;

export interface SearchOrCreatePickerProps {
  /** Dialog title. Names the THING, not the act: "Customer", not "Pick a customer". */
  readonly title: string;
  readonly description?: string;
  /** The control that opens the picker. Focus returns here on close. */
  readonly trigger: React.ReactNode;
  /**
   * Runs on every settled query. Must reject or resolve; a promise that never
   * settles leaves the machine in `searching` forever, which renders as a
   * spinner with no explanation.
   */
  readonly onSearch: (query: string) => Promise<readonly PickerOption[]>;
  /**
   * Create the object. `idempotencyKey` is stable for the whole time the
   * picker is open — pass it through to the command envelope so a retry after
   * a timeout resolves to the same row instead of a second one.
   */
  readonly onCreate?: (args: {
    query: string;
    idempotencyKey: string;
  }) => Promise<PickerOption>;
  /** Attach the chosen object to the parent. Separate from create, on purpose. */
  readonly onAttach: (option: PickerOption) => Promise<void>;
  /**
   * False for operators without the capability. The control disappears rather
   * than erroring on press — an unauthorized create is not a runtime failure,
   * it is an action that was never theirs.
   */
  readonly canCreateNew?: boolean;
  readonly searchLabel?: string;
  readonly createLabel?: (query: string) => string;
  readonly emptyLabel?: string;
  /** Test seam: the machine's idempotency key. Defaults to a fresh UUID per open. */
  readonly mintKey?: () => string;
}

function defaultMintKey(): string {
  // `randomUUID` is present in every browser this app supports and in jsdom.
  // The fallback exists so a non-secure context (a LAN IP on a venue tablet,
  // which is a real deployment for the POS) degrades to a usable key rather
  // than throwing inside a click handler.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pick-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function SearchOrCreatePicker({
  title,
  description,
  trigger,
  onSearch,
  onCreate,
  onAttach,
  canCreateNew = true,
  searchLabel = "Search",
  createLabel = (query) => `Create “${query}”`,
  emptyLabel = "Nothing matches yet.",
  mintKey = defaultMintKey,
}: SearchOrCreatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [state, dispatch] = React.useReducer(pickerReducer, undefined, () =>
    initialPickerState(mintKey()),
  );
  const inputId = React.useId();

  // Held in a ref rather than listed as a dependency. A caller that passes an
  // inline `mintKey` gives it a new identity on every render, and a dependency
  // on that would re-run this effect and mint a SECOND idempotency key while
  // the drawer is still open — which is the one thing the key must never do,
  // since it is what stops a retried create from making two children. The ref
  // keeps the newest function without making its identity observable.
  const mintKeyRef = React.useRef(mintKey);
  React.useEffect(() => {
    mintKeyRef.current = mintKey;
  }, [mintKey]);

  React.useEffect(() => {
    if (open) dispatch({ type: "open", createKey: mintKeyRef.current() });
  }, [open]);

  const { query, status, results, orphan, error, createKey } = state;

  React.useEffect(() => {
    if (!open) return;
    if (status !== "searching") return;
    let cancelled = false;
    const timer = setTimeout(() => {
      onSearch(query)
        .then((found) => {
          // The query is echoed back with the results so the reducer can drop
          // an answer to a superseded question. The `cancelled` flag alone is
          // not enough: it only covers unmount, not overlap.
          if (!cancelled) dispatch({ type: "results", query, results: found });
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            dispatch({
              type: "search_failed",
              query,
              error: cause instanceof Error ? cause.message : "Search failed.",
            });
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, status, onSearch]);

  const attach = React.useCallback(
    (option: PickerOption) => {
      dispatch({ type: "attach", option });
      onAttach(option)
        .then(() => {
          dispatch({ type: "attached", option });
          setOpen(false);
        })
        .catch((cause: unknown) => {
          dispatch({
            type: "attach_failed",
            error: cause instanceof Error ? cause.message : "Could not attach it.",
          });
        });
    },
    [onAttach],
  );

  const create = React.useCallback(() => {
    if (!onCreate) return;
    dispatch({ type: "create" });
    onCreate({ query, idempotencyKey: createKey })
      .then((option) => {
        dispatch({ type: "created", option });
        // Create then attach, as two steps, because they fail separately. If
        // this attach fails the object is still an orphan in the list above.
        onAttach(option)
          .then(() => {
            dispatch({ type: "attached", option });
            setOpen(false);
          })
          .catch((cause: unknown) => {
            dispatch({
              type: "attach_failed",
              error: cause instanceof Error ? cause.message : "Created, but not attached.",
            });
          });
      })
      .catch((cause: unknown) => {
        dispatch({
          type: "create_failed",
          error: cause instanceof Error ? cause.message : "Could not create it.",
        });
      });
  }, [onCreate, onAttach, query, createKey]);

  const duplicate = exactMatch(results, query);
  const creatable = Boolean(onCreate) && canCreateNew && canCreate(state);
  const busy = status === "searching" || status === "creating" || status === "attaching";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description}>
        <div className="space-y-1.5">
          <Label htmlFor={inputId}>{searchLabel}</Label>
          <Input
            id={inputId}
            value={query}
            autoComplete="off"
            onChange={(event) =>
              dispatch({ type: "query", query: event.currentTarget.value })
            }
          />
        </div>

        {orphan ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            “{orphan.label}” was created but is not attached yet. Select it below to
            finish — creating it again would make a second one.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <ul
          className="max-h-64 space-y-1 overflow-y-auto"
          // `aria-busy` rather than swapping the list for a spinner: replacing
          // the list moves focus and loses the operator's place mid-search.
          aria-busy={busy}
        >
          {results.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => attach(option)}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                  "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:pointer-events-none disabled:opacity-50",
                  orphan?.id === option.id && "border border-amber-500/40",
                )}
              >
                <span className="block font-medium">{option.label}</span>
                {option.detail ? (
                  <span className="block text-xs text-muted-foreground">{option.detail}</span>
                ) : null}
              </button>
            </li>
          ))}
          {results.length === 0 && status === "ready" ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</li>
          ) : null}
        </ul>

        <DialogFooter>
          {onCreate && canCreateNew ? (
            <div className="flex flex-col items-stretch gap-1 sm:items-end">
              <Button type="button" variant="outline" disabled={!creatable} onClick={create}>
                {createLabel(query.trim() || "…")}
              </Button>
              {duplicate ? (
                <span className="text-xs text-muted-foreground">
                  “{duplicate.label}” already exists. Creating makes a second one.
                </span>
              ) : null}
            </div>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
