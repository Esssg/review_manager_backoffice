export const ADMIN_STORAGE_KEY = "review_manager_admin_id";
export const ADMIN_INCLUDE_COMPANY_DATA_STORAGE_KEY = "review_manager_include_company_data";

export const ADMIN_MENU_NUMBER = {
  DASHBOARD: 1,
  PRODUCT: 2,
  REVIEW_RECEIVE: 3,
  PRODUCT_OVERVIEW: 4,
  EXPORT: 5,
  FILE_UPLOAD: 6
};

export const ADMIN_MENU_ITEMS = [
  {
    menuNumber: ADMIN_MENU_NUMBER.DASHBOARD,
    label: "대시보드",
    path: "/admin"
  },
  {
    menuNumber: ADMIN_MENU_NUMBER.PRODUCT,
    label: "상품",
    path: "/admin/product"
  },
  {
    menuNumber: ADMIN_MENU_NUMBER.REVIEW_RECEIVE,
    label: "리뷰받기",
    path: "/admin/review-receive/all",
    children: [
      {
        label: "전체보기",
        path: "/admin/review-receive/all"
      },
      {
        label: "진행중보기",
        path: "/admin/review-receive/in-progress"
      },
      {
        label: "완료보기",
        path: "/admin/review-receive/completed"
      }
    ]
  },
  {
    menuNumber: ADMIN_MENU_NUMBER.PRODUCT_OVERVIEW,
    label: "상품전체보기",
    path: "/admin/product-overview/all",
    children: [
      {
        label: "전체보기",
        path: "/admin/product-overview/all"
      },
      {
        label: "상태별보기",
        path: "/admin/product-overview/status"
      }
    ]
  },
  {
    menuNumber: ADMIN_MENU_NUMBER.EXPORT,
    label: "내보내기",
    path: "/admin/export/all-products",
    children: [
      {
        label: "전체상품",
        path: "/admin/export/all-products"
      },
      {
        label: "내상품",
        path: "/admin/export/my-products"
      },
      {
        label: "일자별",
        path: "/admin/export/by-date"
      },
      {
        label: "상품별",
        path: "/admin/export/by-product"
      },
      {
        label: "입금일 기준",
        path: "/admin/export/by-deposit-date"
      },
      {
        label: "상태별",
        path: "/admin/export/by-status"
      },
      {
        label: "신청자 명단",
        path: "/admin/export/applications"
      }
    ]
  },
  {
    menuNumber: ADMIN_MENU_NUMBER.FILE_UPLOAD,
    label: "파일 업로드",
    path: "/admin/file-upload"
  }
];

export function getAdminMenuItemByNumber(menuNumber) {
  return ADMIN_MENU_ITEMS.find((item) => item.menuNumber === menuNumber) ?? null;
}

export function getAdminMenuItemByPathname(pathname) {
  if (pathname === "/admin") {
    return getAdminMenuItemByNumber(ADMIN_MENU_NUMBER.DASHBOARD);
  }

  if (pathname === "/admin/product" || pathname.startsWith("/admin/product/")) {
    return getAdminMenuItemByNumber(ADMIN_MENU_NUMBER.PRODUCT);
  }

  if (pathname === "/admin/review-receive" || pathname.startsWith("/admin/review-receive/")) {
    return getAdminMenuItemByNumber(ADMIN_MENU_NUMBER.REVIEW_RECEIVE);
  }

  if (pathname === "/admin/product-overview" || pathname.startsWith("/admin/product-overview/")) {
    return getAdminMenuItemByNumber(ADMIN_MENU_NUMBER.PRODUCT_OVERVIEW);
  }

  if (pathname === "/admin/export" || pathname.startsWith("/admin/export/")) {
    return getAdminMenuItemByNumber(ADMIN_MENU_NUMBER.EXPORT);
  }

  if (pathname === "/admin/file-upload") {
    return getAdminMenuItemByNumber(ADMIN_MENU_NUMBER.FILE_UPLOAD);
  }

  if (pathname === "/admin/setting") {
    return null;
  }

  return null;
}

export const PRODUCT_DETAIL_TABS = [
  { key: "applications", label: "신청자" },
  { key: "purchase", label: "구매" },
  { key: "review", label: "리뷰" }
];

export const PRODUCT_OVERVIEW_STATUS_TABS = [
  { key: "purchase", label: "구매완료" },
  { key: "review", label: "리뷰완료" },
  { key: "complete", label: "전체완료" }
];

export const REVIEW_RECEIVE_STATUS_TABS = [
  { key: "all", label: "전체보기" },
  { key: "in_progress", label: "진행중보기" },
  { key: "completed", label: "완료보기" }
];

export const STEP_NUMBER_BY_TAB = {
  applications: 1,
  purchase: 2,
  review: 3
};
