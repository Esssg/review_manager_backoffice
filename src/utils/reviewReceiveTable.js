function normalizeSearchValue(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function formatReviewReceiveAccount(bankName, bankAccount, accountHolder) {
  const parts = [bankName, bankAccount, accountHolder]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" ") : "";
}

export function parseReviewReceiveAccount(value) {
  const rawValue = String(value ?? "").trim();
  const parts = rawValue.includes("/")
    ? rawValue.split("/").map((part) => part.trim()).filter(Boolean)
    : rawValue.split(/\s+/).filter(Boolean);

  return {
    bank_name: parts[0] || null,
    bank_account: parts[1] || null,
    account_holder: parts.slice(2).join(" ") || null
  };
}

function buildReviewReceiveSearchText(row, plannedDepositorName) {
  return normalizeSearchValue(
    [
      row.assign_name,
      row.order_number,
      row.buyer_name,
      row.recipient_name,
      row.purchase_account,
      row.contact,
      row.address,
      row.accountInfoInput || formatReviewReceiveAccount(row.bank_name, row.bank_account, row.account_holder),
      row.amount == null ? "" : String(row.amount),
      row.review_fee == null ? "" : String(row.review_fee),
      plannedDepositorName,
      row.deposited_at,
      row.actual_depositor_name
    ].join(" ")
  );
}

export function filterReviewReceiveRows(rows, query, plannedDepositorName) {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return rows;
  }

  return rows.filter((row) =>
    buildReviewReceiveSearchText(row, plannedDepositorName).includes(normalizedQuery)
  );
}

export function formatPurchaseBuyerClipboardText(rows, rowNumberMap) {
  const nameCounts = rows.reduce((acc, row) => {
    const assignName = String(row.assign_name ?? "").trim();

    if (!assignName) {
      return acc;
    }

    acc[assignName] = (acc[assignName] ?? 0) + 1;
    return acc;
  }, {});

  const duplicateNameIndexes = {};

  return rows
    .map((row) => {
      const rowNumber = rowNumberMap[row.id] ?? "-";
      const assignName = String(row.assign_name ?? "").trim();
      const columns = [String(rowNumber), assignName];

      if (assignName && nameCounts[assignName] > 1) {
        duplicateNameIndexes[assignName] = (duplicateNameIndexes[assignName] ?? 0) + 1;
        columns.push(String(duplicateNameIndexes[assignName]));
      }

      return columns.join("\t").trimEnd();
    })
    .join("\n");
}
