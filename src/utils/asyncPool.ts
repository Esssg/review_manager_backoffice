// @ts-nocheck

export async function runWithConcurrency(items, worker, options = {}) {
  const sourceItems = Array.from(items ?? []);
  const concurrency = Math.max(1, Math.floor(Number(options.concurrency) || 1));
  const results = new Array(sourceItems.length);
  let nextIndex = 0;
  let completed = 0;

  if (sourceItems.length === 0) {
    return results;
  }

  const consume = async () => {
    while (nextIndex < sourceItems.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(sourceItems[index], index);
      completed += 1;
      options.onProgress?.({ completed, total: sourceItems.length, index });
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, sourceItems.length) }, consume));
  return results;
}
