/**
 * TUL-920: a synchronous in-flight lock for the guest chat send paths. The
 * `sending` flag the hooks read is React state, so two submits in the same tick
 * (double Enter, Enter plus a tap) both see `sending === false` and post twice.
 * This lock flips before the first await, so the second call is dropped.
 */
export function createSendLock() {
  let busy = false;
  return {
    /** Runs `fn` unless a send is already in flight; the lock always releases. */
    async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
      if (busy) return undefined;
      busy = true;
      try {
        return await fn();
      } finally {
        busy = false;
      }
    },
    get busy() {
      return busy;
    },
  };
}
