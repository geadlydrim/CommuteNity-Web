/** How long one server-side Supabase request may take before it's cancelled. */
export const SUPABASE_REQUEST_TIMEOUT_MS = 5000;

/**
 * `fetch` for server-side Supabase clients: aborts any request that takes
 * longer than {@link SUPABASE_REQUEST_TIMEOUT_MS}, or when the caller's own
 * signal aborts, so a slow session check is actually cancelled rather than
 * left running. The timer is cleared once the request settles.
 *
 * The signals are combined by hand because the Edge runtime that runs the
 * middleware has no `AbortSignal.any`.
 */
export const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const callerSignal = init?.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException(
          `Supabase request timed out after ${SUPABASE_REQUEST_TIMEOUT_MS}ms`,
          "TimeoutError",
        ),
      ),
    SUPABASE_REQUEST_TIMEOUT_MS,
  );

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
};
