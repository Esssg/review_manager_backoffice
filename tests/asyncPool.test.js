import test from "node:test";
import assert from "node:assert/strict";
import { runWithConcurrency } from "../src/utils/asyncPool.js";

test("동시성 제한을 지키면서 결과는 입력 순서를 유지한다", async () => {
  let activeCount = 0;
  let maxActiveCount = 0;
  const progress = [];

  const results = await runWithConcurrency([0, 1, 2, 3, 4], async (value) => {
    activeCount += 1;
    maxActiveCount = Math.max(maxActiveCount, activeCount);
    await new Promise((resolve) => setTimeout(resolve, value === 0 ? 12 : 2));
    activeCount -= 1;
    return value * 10;
  }, {
    concurrency: 2,
    onProgress: ({ completed, total }) => progress.push(`${completed}/${total}`)
  });

  assert.deepEqual(results, [0, 10, 20, 30, 40]);
  assert.equal(maxActiveCount, 2);
  assert.deepEqual([...progress].sort((left, right) => Number(left.split("/")[0]) - Number(right.split("/")[0])), [
    "1/5",
    "2/5",
    "3/5",
    "4/5",
    "5/5"
  ]);
});

test("빈 입력은 worker를 실행하지 않고 빈 결과를 반환한다", async () => {
  let callCount = 0;

  const results = await runWithConcurrency([], async () => {
    callCount += 1;
    return null;
  });

  assert.deepEqual(results, []);
  assert.equal(callCount, 0);
});
