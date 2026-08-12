// @ts-nocheck

export const EXPORT_PAGE_CONFIGS = {
  allProducts: {
    title: "전체상품 내보내기",
    description: "회사 범위 또는 본인 범위의 모든 상품과 관련 제출 데이터를 Excel로 내보냅니다.",
    columnStorageKey: "review_manager_export_columns_all_products",
    filenameLabel: "전체상품",
    sheetName: "전체상품",
    emptyMessage: "내보낼 데이터가 없습니다.",
    emptyHint:
      "내보낼 제출 데이터가 없습니다. 상품이 없거나 제출이 아직 없을 수 있습니다. 조회 범위를 내 회사 전체로 바꿔 보세요.",
    showCompanyToggle: true
  },
  myProducts: {
    title: "내상품 내보내기",
    description:
      "로그인한 관리자 본인(manager_id)으로 등록된 상품과 관련 제출만 Excel로 내보냅니다. 회사 전체 범위 선택은 이 화면에 표시되지 않습니다.",
    columnStorageKey: "review_manager_export_columns_my_products",
    filenameLabel: "내상품",
    sheetName: "내상품",
    emptyMessage: "내보낼 데이터가 없습니다.",
    emptyHint: "내보낼 제출 데이터가 없습니다. 본인 계정으로 등록된 상품이 없거나 아직 제출이 없을 수 있습니다.",
    forcePersonalScope: true,
    showCompanyToggle: false
  },
  byDate: {
    title: "일자별 내보내기",
    description: "제출 등록일 또는 입금일 범위로 데이터를 추려서 Excel로 내보냅니다.",
    columnStorageKey: "review_manager_export_columns_by_date",
    filenameLabel: "일자별",
    sheetName: "일자별",
    emptyMessage: "선택한 기간에 맞는 내보내기 데이터가 없습니다.",
    showCompanyToggle: true
  },
  byProduct: {
    title: "상품별 내보내기",
    description: "특정 상품 1건을 골라 그 상품의 제출 데이터와 신청자 명단을 같은 워크북으로 내보냅니다.",
    submissionColumnStorageKey: "review_manager_export_columns_by_product_submissions",
    applicationColumnStorageKey: "review_manager_export_columns_by_product_applications",
    filenameLabel: "상품별",
    showCompanyToggle: true
  },
  byDepositDate: {
    title: "입금일 기준 내보내기",
    description: "입금완료된 제출만 입금일 범위로 걸러 정산용 Excel로 내보냅니다.",
    columnStorageKey: "review_manager_export_columns_by_deposit_date",
    filenameLabel: "입금일기준",
    sheetName: "입금일 기준",
    emptyMessage: "선택한 입금일 범위에 맞는 정산 데이터가 없습니다.",
    defaultPreset: "settlement",
    showCompanyToggle: true
  },
  byStatus: {
    title: "상태별 내보내기",
    description: "구매완료, 리뷰완료, 전체완료 단계 기준으로 제출을 묶어 Excel로 내보냅니다.",
    columnStorageKey: "review_manager_export_columns_by_status",
    filenameLabel: "상태별",
    sheetName: "상태별",
    emptyMessage: "선택한 상태에 맞는 내보내기 데이터가 없습니다.",
    showCompanyToggle: true
  },
  applications: {
    title: "신청자 명단 내보내기",
    description: "applications 테이블 중심으로 확정/미확정 신청자 명단을 Excel로 내보냅니다.",
    columnStorageKey: "review_manager_export_columns_applications",
    filenameLabel: "신청자명단",
    sheetName: "신청자 명단",
    emptyMessage: "선택한 조건에 맞는 신청자 데이터가 없습니다.",
    showCompanyToggle: true
  },
  photos: {
    title: "사진내려받기",
    description: "상품을 필터링한 뒤 해당 상품의 모든 submission 증빙 사진을 ZIP으로 내려받습니다.",
    showCompanyToggle: true
  }
};
