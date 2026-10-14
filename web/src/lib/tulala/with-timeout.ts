/** Race a promise against a wall clock; past `ms` the fallback wins. */
export async function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(onTimeout), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Like `withTimeout`, but the work receives an AbortSignal that fires at the
 * wall clock, so a stalled provider request is cancelled instead of left
 * running after the caller has moved on (TUL-541).
 */
export async function withAbortTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, onTimeout: T): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(controller.signal),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(onTimeout);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
