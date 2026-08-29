// @ts-nocheck

function normalizeText(value) {
  return String(value ?? "").trim();
}

/**
 * DB 설정이 아직 없는 구형 번들에서도 안전하게 동작하는 표시용 정규화다.
 * 저장 서비스는 settingsResolver의 엄격한 0~100 검증을 먼저 적용하고,
 * 표시 유틸은 잘못된 값이 들어와도 회사명을 잘못 잘라 빈 값으로 만들지 않는다.
 */
export function normalizeCompanyNameTrimLength(value) {
  const numericValue = Number(value);

  if (!Number.isInteger(numericValue) || numericValue < 0 || numericValue > 100) {
    return 0;
  }

  return numericValue;
}

export function formatPlannedDepositorName(productDate, companyName, options = {}) {
  const dateText = normalizeText(productDate);
  const companyText = normalizeText(companyName);
  const trimLength = normalizeCompanyNameTrimLength(
    options.companyNameTrimLength ?? options.trimLength ?? 0
  );
  const dateMatch = dateText.match(/^\d{4}[-.](\d{1,2})[-.](\d{1,2})$/);
  const displayCompanyName = trimLength > 0
    ? Array.from(companyText).slice(0, trimLength).join("")
    : companyText;

  if (!dateMatch) {
    return displayCompanyName;
  }

  return `${dateMatch[1].padStart(2, "0")}${dateMatch[2].padStart(2, "0")}${displayCompanyName}`;
}

export function applyPlannedDepositorNameDefault(form, updates) {
  const nextForm = {
    ...form,
    ...updates
  };
  const shouldUseCompanyPay =
    nextForm.productFeeDepositGb === "company" && nextForm.reviewFeeDepositGb === "company";

  if (shouldUseCompanyPay) {
    return {
      ...nextForm,
      plannedDepositorName: "업체페이"
    };
  }

  if (
    !("productDate" in updates) &&
    !("companyName" in updates) &&
    !("productFeeDepositGb" in updates) &&
    !("reviewFeeDepositGb" in updates)
  ) {
    return nextForm;
  }

  return {
    ...nextForm,
    plannedDepositorName: formatPlannedDepositorName(nextForm.productDate, nextForm.companyName, {
      companyNameTrimLength: nextForm.companyNameTrimLength
    })
  };
}
