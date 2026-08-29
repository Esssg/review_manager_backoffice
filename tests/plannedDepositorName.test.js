import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPlannedDepositorName,
  normalizeCompanyNameTrimLength
} from "../src/utils/plannedDepositorName.ts";

test("회사명 자르기 0은 전체 이름을 표시한다", () => {
  assert.equal(
    formatPlannedDepositorName("2026-04-01", "한화시스템", { companyNameTrimLength: 0 }),
    "0401한화시스템"
  );
});

test("회사명 자르기는 유니코드 문자 기준으로 적용한다", () => {
  assert.equal(
    formatPlannedDepositorName("2026.04.01", "한화시스템", { companyNameTrimLength: 3 }),
    "0401한화시"
  );
  assert.equal(
    formatPlannedDepositorName("2026.04.01", "회사😀테스트", { companyNameTrimLength: 3 }),
    "0401회사😀"
  );
});

test("표시 유틸의 비정상 자르기 값은 안전한 0으로 정규화한다", () => {
  assert.equal(normalizeCompanyNameTrimLength(-1), 0);
  assert.equal(normalizeCompanyNameTrimLength(101), 0);
  assert.equal(normalizeCompanyNameTrimLength("not-a-number"), 0);
  assert.equal(normalizeCompanyNameTrimLength(4), 4);
});
