import { buildProductOverviewRows, sortProductOverviewRows } from "./productOverviewRows";

export const EXPORT_COLUMN_PRESET = {
  BASIC: "basic",
  SETTLEMENT: "settlement",
  REVIEW: "review",
  ALL: "all"
};

export const APPLICATION_EXPORT_COLUMN_PRESET = {
  BASIC: "basic",
  CONFIRMED: "confirmed",
  ALL: "all"
};

export const EXPORT_COLUMN_PRESETS = [
  { key: EXPORT_COLUMN_PRESET.BASIC, label: "기본" },
  { key: EXPORT_COLUMN_PRESET.SETTLEMENT, label: "정산용" },
  { key: EXPORT_COLUMN_PRESET.REVIEW, label: "리뷰용" },
  { key: EXPORT_COLUMN_PRESET.ALL, label: "전체" }
];

export const SUBMISSION_EXPORT_COLUMNS = [
  { key: "submissions.id", label: "제출 ID", source: "submissions", field: "id", type: "number" },
  { key: "submissions.product_id", label: "상품 ID", source: "submissions", field: "product_id", type: "number" },
  { key: "submissions.order_number", label: "주문번호", source: "submissions", field: "order_number", type: "text" },
  { key: "submissions.buyer_name", label: "구매자", source: "submissions", field: "buyer_name", type: "text" },
  { key: "submissions.recipient_name", label: "수취인", source: "submissions", field: "recipient_name", type: "text" },
  { key: "submissions.purchase_account", label: "구매계정", source: "submissions", field: "purchase_account", type: "text" },
  { key: "submissions.contact", label: "연락처", source: "submissions", field: "contact", type: "text" },
  { key: "submissions.address", label: "주소", source: "submissions", field: "address", type: "text" },
  { key: "submissions.bank_name", label: "은행", source: "submissions", field: "bank_name", type: "text" },
  { key: "submissions.bank_account", label: "계좌번호", source: "submissions", field: "bank_account", type: "text" },
  { key: "submissions.account_holder", label: "예금주", source: "submissions", field: "account_holder", type: "text" },
  { key: "submissions.amount", label: "금액", source: "submissions", field: "amount", type: "number" },
  { key: "submissions.review_fee", label: "리뷰비", source: "submissions", field: "review_fee", type: "number" },
  {
    key: "submissions.assign_name",
    label: "배정명",
    source: "submissions",
    field: "assign_name",
    type: "text"
  },
  {
    key: "submissions.is_purchase_verified",
    label: "구매완료",
    source: "submissions",
    field: "is_purchase_verified",
    type: "boolean"
  },
  {
    key: "submissions.is_review_verified",
    label: "리뷰완료",
    source: "submissions",
    field: "is_review_verified",
    type: "boolean"
  },
  {
    key: "submissions.is_deposit_verified",
    label: "입금완료",
    source: "submissions",
    field: "is_deposit_verified",
    type: "boolean"
  },
  { key: "submissions.deposited_at", label: "입금일", source: "submissions", field: "deposited_at", type: "date" },
  {
    key: "submissions.actual_depositor_name",
    label: "실제입금자명",
    source: "submissions",
    field: "actual_depositor_name",
    type: "text"
  },
  { key: "submissions.created_at", label: "제출 등록일", source: "submissions", field: "created_at", type: "date" }
];

export const PRODUCT_EXPORT_COLUMNS = [
  { key: "products.id", label: "상품 ID", source: "products", field: "id", type: "number" },
  { key: "products.manager_id", label: "관리자", source: "products", field: "manager_id", type: "text" },
  { key: "products.product_date", label: "상품날짜", source: "products", field: "product_date", type: "date" },
  { key: "products.title", label: "상품 제목", source: "products", field: "title", type: "text" },
  { key: "products.description", label: "설명", source: "products", field: "description", type: "text" },
  { key: "products.product_name", label: "품명", source: "products", field: "product_name", type: "text" },
  { key: "products.company_name", label: "업체명", source: "products", field: "company_name", type: "text" },
  { key: "products.option_name", label: "옵션", source: "products", field: "option_name", type: "text" },
  { key: "products.review_type", label: "리뷰형태", source: "products", field: "review_type", type: "text" },
  { key: "products.deposit_date", label: "입금 예정일", source: "products", field: "deposit_date", type: "date" },
  {
    key: "products.planned_depositor_name",
    label: "입금자명(예정)",
    source: "products",
    field: "planned_depositor_name",
    type: "text"
  }
];

export const DERIVED_EXPORT_COLUMNS = [
  { key: "derived.stage", label: "진행단계", source: "derived", field: "stage", type: "text" },
  { key: "derived.review_photos_status", label: "사진", source: "derived", field: "review_photos_status", type: "text" },
  {
    key: "derived.purchase_photo_count",
    label: "구매사진 수",
    source: "derived",
    field: "purchase_photo_count",
    type: "number"
  },
  {
    key: "derived.review_photo_count",
    label: "리뷰사진 수",
    source: "derived",
    field: "review_photo_count",
    type: "number"
  }
];

export const APPLICATION_EXPORT_COLUMNS = [
  { key: "applications.id", label: "신청 ID", source: "applications", field: "id", type: "number" },
  { key: "applications.product_id", label: "상품 ID", source: "applications", field: "product_id", type: "number" },
  { key: "applications.applicant_name", label: "신청자명", source: "applications", field: "applicant_name", type: "text" },
  {
    key: "applications.is_confirmed",
    label: "확정 여부",
    source: "applications",
    field: "is_confirmed",
    type: "boolean"
  },
  { key: "applications.created_at", label: "신청일", source: "applications", field: "created_at", type: "date" },
  { key: "products.manager_id", label: "관리자", source: "products", field: "manager_id", type: "text" },
  { key: "products.product_date", label: "상품날짜", source: "products", field: "product_date", type: "date" },
  { key: "products.title", label: "상품 제목", source: "products", field: "title", type: "text" },
  { key: "products.product_name", label: "품명", source: "products", field: "product_name", type: "text" },
  { key: "products.company_name", label: "업체명", source: "products", field: "company_name", type: "text" },
  {
    key: "derived.application_status",
    label: "신청 상태",
    source: "derived",
    field: "application_status",
    type: "text"
  }
];

export const EXPORT_COLUMNS = [
  { key: "products.manager_id", label: "관리자", source: "products", field: "manager_id", type: "text" },
  { key: "products.product_date", label: "상품날짜", source: "products", field: "product_date", type: "date" },
  { key: "products.title", label: "상품 제목", source: "products", field: "title", type: "text" },
  { key: "products.description", label: "설명", source: "products", field: "description", type: "text" },
  { key: "products.company_name", label: "업체명", source: "products", field: "company_name", type: "text" },
  { key: "products.product_name", label: "품명", source: "products", field: "product_name", type: "text" },
  { key: "products.option_name", label: "옵션", source: "products", field: "option_name", type: "text" },
  { key: "products.review_type", label: "리뷰형태", source: "products", field: "review_type", type: "text" },
  { key: "submissions.assign_name", label: "배정명", source: "submissions", field: "assign_name", type: "text" },
  { key: "derived.review_photos_status", label: "사진", source: "derived", field: "review_photos_status", type: "text" },
  { key: "submissions.order_number", label: "주문번호", source: "submissions", field: "order_number", type: "text" },
  { key: "submissions.buyer_name", label: "구매자", source: "submissions", field: "buyer_name", type: "text" },
  { key: "submissions.recipient_name", label: "수취인", source: "submissions", field: "recipient_name", type: "text" },
  { key: "submissions.purchase_account", label: "구매계정", source: "submissions", field: "purchase_account", type: "text" },
  { key: "submissions.contact", label: "연락처", source: "submissions", field: "contact", type: "text" },
  { key: "submissions.address", label: "주소", source: "submissions", field: "address", type: "text" },
  { key: "submissions.bank_name", label: "은행", source: "submissions", field: "bank_name", type: "text" },
  { key: "submissions.bank_account", label: "계좌번호", source: "submissions", field: "bank_account", type: "text" },
  { key: "submissions.account_holder", label: "예금주", source: "submissions", field: "account_holder", type: "text" },
  { key: "submissions.amount", label: "금액", source: "submissions", field: "amount", type: "number" },
  { key: "submissions.review_fee", label: "리뷰비", source: "submissions", field: "review_fee", type: "number" },
  {
    key: "products.planned_depositor_name",
    label: "입금자명(예정)",
    source: "products",
    field: "planned_depositor_name",
    type: "text"
  },
  {
    key: "submissions.is_review_verified",
    label: "리뷰완료",
    source: "submissions",
    field: "is_review_verified",
    type: "boolean"
  },
  {
    key: "submissions.is_deposit_verified",
    label: "입금완료",
    source: "submissions",
    field: "is_deposit_verified",
    type: "boolean"
  },
  { key: "submissions.deposited_at", label: "입금일", source: "submissions", field: "deposited_at", type: "date" },
  {
    key: "submissions.actual_depositor_name",
    label: "실제입금자명",
    source: "submissions",
    field: "actual_depositor_name",
    type: "text"
  },
  { key: "submissions.id", label: "제출 ID", source: "submissions", field: "id", type: "number" },
  { key: "submissions.product_id", label: "상품 ID", source: "submissions", field: "product_id", type: "number" },
  {
    key: "submissions.is_purchase_verified",
    label: "구매완료",
    source: "submissions",
    field: "is_purchase_verified",
    type: "boolean"
  },
  { key: "submissions.created_at", label: "제출 등록일", source: "submissions", field: "created_at", type: "date" },
  { key: "products.id", label: "상품 ID", source: "products", field: "id", type: "number" },
  { key: "products.deposit_date", label: "입금 예정일", source: "products", field: "deposit_date", type: "date" },
  { key: "derived.stage", label: "진행단계", source: "derived", field: "stage", type: "text" },
  {
    key: "derived.purchase_photo_count",
    label: "구매사진 수",
    source: "derived",
    field: "purchase_photo_count",
    type: "number"
  },
  {
    key: "derived.review_photo_count",
    label: "리뷰사진 수",
    source: "derived",
    field: "review_photo_count",
    type: "number"
  }
];

const PRESET_COLUMN_KEYS = {
  [EXPORT_COLUMN_PRESET.BASIC]: [
    "products.manager_id",
    "products.product_date",
    "products.title",
    "products.description",
    "products.company_name",
    "products.product_name",
    "products.option_name",
    "products.review_type",
    "submissions.assign_name",
    "derived.review_photos_status",
    "submissions.order_number",
    "submissions.buyer_name",
    "submissions.recipient_name",
    "submissions.purchase_account",
    "submissions.contact",
    "submissions.address",
    "submissions.bank_name",
    "submissions.bank_account",
    "submissions.account_holder",
    "submissions.amount",
    "submissions.review_fee",
    "products.planned_depositor_name",
    "submissions.is_review_verified",
    "submissions.is_deposit_verified",
    "submissions.deposited_at",
    "submissions.actual_depositor_name"
  ],
  [EXPORT_COLUMN_PRESET.SETTLEMENT]: [
    "products.title",
    "products.product_name",
    "submissions.review_fee",
    "products.planned_depositor_name",
    "submissions.order_number",
    "submissions.buyer_name",
    "submissions.account_holder",
    "submissions.bank_name",
    "submissions.bank_account",
    "submissions.amount",
    "submissions.is_deposit_verified",
    "submissions.deposited_at",
    "submissions.actual_depositor_name"
  ],
  [EXPORT_COLUMN_PRESET.REVIEW]: [
    "products.title",
    "products.review_type",
    "submissions.order_number",
    "submissions.buyer_name",
    "submissions.assign_name",
    "submissions.is_purchase_verified",
    "submissions.is_review_verified",
    "derived.stage",
    "derived.review_photo_count",
    "derived.purchase_photo_count"
  ]
};

const APPLICATION_PRESET_COLUMN_KEYS = {
  [APPLICATION_EXPORT_COLUMN_PRESET.BASIC]: [
    "products.title",
    "products.product_date",
    "products.product_name",
    "applications.applicant_name",
    "derived.application_status",
    "applications.created_at"
  ],
  [APPLICATION_EXPORT_COLUMN_PRESET.CONFIRMED]: [
    "products.title",
    "products.product_date",
    "products.product_name",
    "applications.applicant_name",
    "applications.is_confirmed",
    "applications.created_at",
    "products.manager_id"
  ]
};

export function getPresetColumnKeys(presetKey) {
  if (presetKey === EXPORT_COLUMN_PRESET.ALL) {
    return EXPORT_COLUMNS.map((column) => column.key);
  }

  return PRESET_COLUMN_KEYS[presetKey] ?? PRESET_COLUMN_KEYS[EXPORT_COLUMN_PRESET.BASIC];
}

export function getApplicationPresetColumnKeys(presetKey) {
  if (presetKey === APPLICATION_EXPORT_COLUMN_PRESET.ALL) {
    return APPLICATION_EXPORT_COLUMNS.map((column) => column.key);
  }

  return (
    APPLICATION_PRESET_COLUMN_KEYS[presetKey] ??
    APPLICATION_PRESET_COLUMN_KEYS[APPLICATION_EXPORT_COLUMN_PRESET.BASIC]
  );
}

export function getExportColumnsByKeys(columnKeys, columns = EXPORT_COLUMNS) {
  const columnMap = new Map(columns.map((column) => [column.key, column]));

  return (columnKeys ?? []).map((key) => columnMap.get(key)).filter(Boolean);
}

export function formatExportCellValue(value, type) {
  if (value == null) {
    return "";
  }

  if (type === "boolean") {
    return value ? "예" : "아니오";
  }

  return value;
}

export function getSubmissionStageLabel(submission) {
  if (submission?.is_review_verified) {
    return submission.is_deposit_verified ? "전체완료" : "리뷰완료";
  }

  return "구매완료";
}

export function getApplicationStatusLabel(application) {
  return application?.is_confirmed ? "확정" : "미확정";
}

export function buildEvidencePhotoCountMap(evidencePhotos) {
  return (evidencePhotos ?? []).reduce((acc, photo) => {
    if (!photo?.submission_id) {
      return acc;
    }

    const current = acc[photo.submission_id] ?? {
      purchase_photo_count: 0,
      review_photo_count: 0
    };

    if (photo.photo_type === "purchase") {
      current.purchase_photo_count += 1;
    }

    if (photo.photo_type === "review") {
      current.review_photo_count += 1;
    }

    acc[photo.submission_id] = current;
    return acc;
  }, {});
}

export function buildSubmissionExportRows({ products = [], submissions = [], evidencePhotos = [], selectedColumnKeys = [] }) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const photoCountMap = buildEvidencePhotoCountMap(evidencePhotos);
  const selectedColumns = getExportColumnsByKeys(selectedColumnKeys);
  const sortedSubmissionIds = sortProductOverviewRows(buildProductOverviewRows(products, submissions)).map(
    (row) => row.submission_id
  );
  const submissionMap = new Map(submissions.map((submission) => [submission.id, submission]));
  const sortedSubmissions = sortedSubmissionIds.map((submissionId) => submissionMap.get(submissionId)).filter(Boolean);

  return sortedSubmissions.map((submission) => {
    const product = productMap.get(submission.product_id) ?? {};
    const photoCounts = photoCountMap[submission.id] ?? {
      purchase_photo_count: 0,
      review_photo_count: 0
    };

    return selectedColumns.reduce((row, column) => {
      const source =
        column.source === "products"
          ? product
          : column.source === "derived"
            ? {
                ...photoCounts,
                review_photos_status: photoCounts.review_photo_count > 0 ? "제출 완료" : "제출 전"
              }
            : submission;
      const rawValue = column.key === "derived.stage" ? getSubmissionStageLabel(submission) : source[column.field];

      row[column.label] = formatExportCellValue(rawValue, column.type);
      return row;
    }, {});
  });
}

export function buildApplicationExportRows({ products = [], applications = [], selectedColumnKeys = [] }) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const selectedColumns = getExportColumnsByKeys(selectedColumnKeys, APPLICATION_EXPORT_COLUMNS);

  return applications.map((application) => {
    const product = productMap.get(application.product_id) ?? {};

    return selectedColumns.reduce((row, column) => {
      const source =
        column.source === "products"
          ? product
          : column.source === "derived"
            ? { application_status: getApplicationStatusLabel(application) }
            : application;
      const rawValue = source[column.field];

      row[column.label] = formatExportCellValue(rawValue, column.type);
      return row;
    }, {});
  });
}

export function buildExportPreviewRows(rows, limit = 50) {
  return (rows ?? []).slice(0, limit);
}
