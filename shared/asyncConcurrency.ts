export async function mapWithConcurrency<Input, Output>(
  values: Input[],
  concurrency: number,
  task: (value: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("concurrency must be a positive integer");
  }
  const results = new Array<Output>(values.length);
  let nextIndex = 0;
  let failed = false;
  let firstError: unknown;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (!failed && nextIndex < values.length) {
      const index = nextIndex++;
      try {
        results[index] = await task(values[index]!, index);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
  });
  await Promise.all(workers);
  if (failed) throw firstError;
  return results;
}
