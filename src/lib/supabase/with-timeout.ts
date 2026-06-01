export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`[Supabase] ${label} timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}
