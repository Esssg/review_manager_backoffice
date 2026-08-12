// @ts-nocheck

function normalizeText(value) {
  return String(value ?? "").trim();
}

export function formatPlannedDepositorName(productDate, companyName) {
  const dateText = normalizeText(productDate);
  const companyText = normalizeText(companyName);
  const dateMatch = dateText.match(/^\d{4}[-.](\d{1,2})[-.](\d{1,2})$/);

  if (!dateMatch) {
    return companyText;
  }

  return `${dateMatch[1].padStart(2, "0")}${dateMatch[2].padStart(2, "0")}${companyText}`;
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
    plannedDepositorName: formatPlannedDepositorName(nextForm.productDate, nextForm.companyName)
  };
}
