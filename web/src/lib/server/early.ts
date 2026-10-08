/** Start a read now; an unawaited early return must not become an unhandled rejection (TUL-444). */
export const early = <T>(p: Promise<T>): Promise<T> => (p.catch(() => undefined), p);
