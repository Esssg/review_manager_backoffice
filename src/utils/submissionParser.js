export function parseAmountToNumber(value) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

export function parseSubmissionText(rawText) {
  const parts = rawText
    .split("/")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (parts.length === 8) {
    const [orderNumber, buyerName, recipientName, purchaseAccount, contact, address, bankChunk, amountText] = parts;
    const bankParts = bankChunk.split(/\s+/).filter(Boolean);
    if (bankParts.length < 3) {
      throw new Error("계좌 정보 형식이 올바르지 않습니다. 예: 국민은행 123-45-678901 홍길동");
    }

    return {
      order_number: orderNumber,
      buyer_name: buyerName,
      recipient_name: recipientName,
      purchase_account: purchaseAccount,
      contact: contact.replace(/\D/g, ""),
      address,
      bank_name: bankParts[0],
      bank_account: bankParts[1],
      account_holder: bankParts.slice(2).join(" "),
      amount: parseAmountToNumber(amountText)
    };
  }

  if (parts.length === 10) {
    const [
      orderNumber,
      buyerName,
      recipientName,
      purchaseAccount,
      contact,
      address,
      bankName,
      bankAccount,
      accountHolder,
      amountText
    ] = parts;

    return {
      order_number: orderNumber,
      buyer_name: buyerName,
      recipient_name: recipientName,
      purchase_account: purchaseAccount,
      contact: contact.replace(/\D/g, ""),
      address,
      bank_name: bankName,
      bank_account: bankAccount,
      account_holder: accountHolder,
      amount: parseAmountToNumber(amountText)
    };
  }

  throw new Error("입력 형식이 맞지 않습니다. '/'로 7개 또는 9개 구분자를 사용해주세요.");
}
