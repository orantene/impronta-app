/**
 * SEARCH-OR-CREATE — the state machine behind the most repeated contract in
 * the 2026 blueprints.
 *
 * Every document states the same requirement in its own words: "search
 * existing → inspect → select, with Create new for authorized users, the
 * parent draft preserved, focus returned to the trigger, and
 * created-but-unattached objects discoverable on retry". Today it is
 * re-implemented per drawer, and each implementation is wrong in a different
 * place.
 *
 * THE FOUR FAILURES THIS EXISTS TO PREVENT, in the order they cost money.
 *
 * 1. THE DOUBLE CREATE. An operator taps "Create customer" twice on a slow
 *    tablet and the venue has two Ada Lovelaces, one of which holds the
 *    booking and one of which holds the loyalty history. Two defences here:
 *    a `create` event while a create is already in flight is IGNORED, and the
 *    idempotency key is minted once per OPEN and reused for every retry — so
 *    even a create that races past the client guard is deduplicated by the
 *    server. Only the second defence is real; the first is what keeps the UI
 *    honest about it.
 *
 * 2. THE ORPHAN. Create succeeds, attach fails — a dropped connection between
 *    two round trips. The object EXISTS, the parent does not know about it,
 *    and the operator's next move is to create it again, because searching
 *    for it often does not find it yet (a search index, a materialized view,
 *    a replica seconds behind). So the machine REMEMBERS what it created and
 *    merges it into every subsequent result set until it is attached. That is
 *    the "discoverable on retry" clause, and it is a client-side guarantee
 *    because the failure is that the server-side one is not ready.
 *
 * 3. THE LOST DRAFT. The picker must never be a route. Navigating to a create
 *    screen and back unmounts the parent form, which is how a half-filled
 *    booking becomes a blank one. Nothing in this file can enforce that —
 *    `picker-wiring.static.test.ts` does, by asserting the component never
 *    calls the router.
 *
 * 4. THE STALE RESULT. Search is async and typing is fast: a slow response for
 *    "Ad" arriving after a fast response for "Adam" repaints the list with the
 *    wrong rows, and the operator selects from them. Every result event
 *    carries the query it answered, and one that does not match the current
 *    query is DROPPED.
 *
 * FOCUS RETURN IS NOT MODELLED HERE, deliberately. It is a DOM concern with a
 * correct existing implementation — the Dialog primitive returns focus to its
 * trigger because Radix does. Re-implementing it in a reducer would produce a
 * second, worse answer that has to be kept in step with the first.
 */

export interface PickerOption {
  readonly id: string;
  readonly label: string;
  /** The second line: enough to tell two same-named rows apart. */
  readonly detail?: string;
}

export type PickerStatus =
  | "idle"
  | "searching"
  | "ready"
  | "creating"
  | "attaching"
  | "failed";

export interface PickerState {
  readonly status: PickerStatus;
  readonly query: string;
  readonly results: readonly PickerOption[];
  /**
   * Minted once when the picker opens and reused by every create attempt in
   * that session. This is the value that makes create-once TRUE rather than
   * merely likely — see failure 1 above.
   */
  readonly createKey: string;
  /**
   * Created here, not yet attached to the parent. Merged into every result set
   * until an attach succeeds. See failure 2.
   */
  readonly orphan: PickerOption | null;
  readonly selected: PickerOption | null;
  readonly error: string | null;
}

export type PickerEvent =
  | { type: "open"; createKey: string }
  | { type: "query"; query: string }
  | { type: "results"; query: string; results: readonly PickerOption[] }
  | { type: "search_failed"; query: string; error: string }
  | { type: "create" }
  | { type: "created"; option: PickerOption }
  | { type: "create_failed"; error: string }
  | { type: "attach"; option: PickerOption }
  | { type: "attached"; option: PickerOption }
  | { type: "attach_failed"; error: string }
  | { type: "close" };

export function initialPickerState(createKey: string): PickerState {
  return {
    status: "idle",
    query: "",
    results: [],
    createKey,
    orphan: null,
    selected: null,
    error: null,
  };
}

/**
 * Merge the orphan into a result set, newest first, without duplicating it.
 *
 * FIRST, not last. An operator who just created "Ada Lovelace" and had the
 * attach fail is looking for exactly that row; putting it at position nine of
 * a fuzzy-match list is the same as not having it. Deduplication is by id
 * because the server search WILL eventually return it, and two rows with one
 * id is a worse bug than the one this solves.
 */
export function withOrphan(
  results: readonly PickerOption[],
  orphan: PickerOption | null,
): readonly PickerOption[] {
  if (!orphan) return results;
  return [orphan, ...results.filter((option) => option.id !== orphan.id)];
}

export function pickerReducer(state: PickerState, event: PickerEvent): PickerState {
  switch (event.type) {
    case "open":
      // A fresh key per open, and a cleared orphan: an orphan is only
      // meaningful within the session that created it. Carrying one across an
      // open would re-offer a row the operator may have since attached
      // elsewhere.
      return initialPickerState(event.createKey);

    case "query":
      return { ...state, query: event.query, status: "searching", error: null };

    case "results": {
      // Failure 4: an answer to a query nobody is asking any more.
      if (event.query !== state.query) return state;
      return {
        ...state,
        status: "ready",
        results: withOrphan(event.results, state.orphan),
        error: null,
      };
    }

    case "search_failed": {
      if (event.query !== state.query) return state;
      // The orphan survives a failed search, because a failed search is the
      // exact circumstance in which it is the only thing keeping the created
      // object reachable.
      return {
        ...state,
        status: "failed",
        results: withOrphan([], state.orphan),
        error: event.error,
      };
    }

    case "create":
      // Failure 1, client half. Not a queue: a second tap during a create is
      // the same intent expressed twice, so it is dropped rather than
      // remembered.
      if (state.status === "creating" || state.status === "attaching") return state;
      return { ...state, status: "creating", error: null };

    case "created":
      // Deliberately NOT `selected`. Creating is not attaching, and collapsing
      // the two is what makes an attach failure invisible — the parent shows
      // the new object, the server has no link, and the next save writes a
      // booking with no customer.
      return {
        ...state,
        status: "attaching",
        orphan: event.option,
        results: withOrphan(state.results, event.option),
        error: null,
      };

    case "create_failed":
      return { ...state, status: "failed", error: event.error };

    case "attach":
      if (state.status === "attaching") return state;
      return { ...state, status: "attaching", error: null };

    case "attached":
      // The orphan is cleared only HERE. This is the single point at which the
      // object is known to be reachable from the parent.
      return {
        ...state,
        status: "ready",
        orphan: null,
        selected: event.option,
        error: null,
      };

    case "attach_failed":
      // Status returns to `ready`, not `failed`: the list is still usable and
      // the orphan is still in it, so the operator's next action is to try the
      // same row again rather than to start over. The error explains why the
      // row did not stick.
      return { ...state, status: "ready", error: event.error };

    case "close":
      return state;

    default: {
      const never: never = event;
      return never;
    }
  }
}

/**
 * May the create control be pressed?
 *
 * A create with an empty query is refused because the query IS the new
 * object's name in every call site this serves — "Create ''" is a row nobody
 * can find again. The in-flight refusal is failure 1's client half.
 */
export function canCreate(state: PickerState, query = state.query): boolean {
  if (state.status === "creating" || state.status === "attaching") return false;
  return query.trim().length > 0;
}

/**
 * Is there an exact-label match already in the results?
 *
 * Used to demote the create control rather than to hide it: an operator who
 * genuinely needs a second "Table 4" must be able to make one, and a picker
 * that silently refuses is a picker they route around by creating the object
 * somewhere else. Comparison is trimmed and case-insensitive because "ada
 * lovelace" and "Ada Lovelace" are the same person to everybody except a
 * string comparison.
 */
export function exactMatch(
  results: readonly PickerOption[],
  query: string,
): PickerOption | null {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return null;
  return results.find((option) => option.label.trim().toLocaleLowerCase() === needle) ?? null;
}
