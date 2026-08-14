export const ADMIN_TUTORIAL_VERSION = "1.0.1";

export const ADMIN_TUTORIAL_STEPS = [
  {
    id: "product-overview-menu",
    target: '[data-tutorial-target="product-overview-menu"]',
    action: "product-overview-menu",
    message: "상품전체보기를 펼쳐주세요. 클릭하세요",
    placement: "right"
  },
  {
    id: "product-overview-all",
    target: '[data-tutorial-target="product-overview-all"]',
    action: "product-overview-all",
    message: "전체보기를 선택해주세요. 클릭하세요",
    placement: "right"
  },
  {
    id: "photo-filter",
    target: '[data-tutorial-target="photo-filter"]',
    action: "photo-filter",
    message: "사진 필터에서 사진 있음을 선택해주세요.",
    placement: "bottom"
  },
  {
    id: "photo-thumb",
    target: '[data-tutorial-target="tutorial-photo-thumb"]',
    action: "photo-open",
    message: "사진 하나를 클릭해주세요.",
    placement: "top"
  },
  {
    id: "photo-info",
    target: '[data-tutorial-target="photo-info"]',
    message: "왼쪽에서 업체명, 품명, 옵션, 리뷰형태, 구매자·수취인·구매계정 정보를 확인할 수 있어요.",
    placement: "right",
    autoAdvanceMs: 1400
  },
  {
    id: "photo-media",
    target: '[data-tutorial-target="photo-media"]',
    message: "오른쪽에서 사진을 확인할 수 있어요.",
    placement: "left",
    autoAdvanceMs: 1400
  },
  {
    id: "photo-close",
    target: '[data-tutorial-target="photo-close"]',
    message: "닫기를 누르면 기존 화면으로 돌아가요.",
    placement: "bottom",
    autoAdvanceMs: 1400
  },
  {
    id: "photo-delete",
    target: '[data-tutorial-target="photo-delete"]',
    action: "photo-delete",
    message: "삭제를 누르면 사진을 삭제할 수 있어요.",
    placement: "bottom"
  },
  {
    id: "photo-next",
    target: '[data-tutorial-target="photo-next"]',
    action: "photo-next",
    message: "다음을 누르면 다음 사진을 볼 수 있어요.",
    placement: "top"
  },
  {
    id: "photo-prev",
    target: '[data-tutorial-target="photo-prev"]',
    action: "photo-prev",
    message: "이전을 누르면 이전 사진을 볼 수 있어요.",
    placement: "top"
  },
  {
    id: "photo-keyboard",
    target: ".photo-modal-content--product-overview",
    action: "photo-arrow-key",
    message: "키보드 좌, 우 화살표로도 넘길 수 있어요~ 좌 또는 우 화살표를 눌러 이동해보세요.",
    placement: "top"
  }
];

export function createTutorialDemoRow() {
  return {
    product_id: -1001,
    submission_id: -1001,
    product_created_at: null,
    submission_created_at: null,
    manager_id: "tutorial",
    title: "튜토리얼 예시 상품",
    product_name: "튜토리얼 예시 상품",
    deposit_date: null,
    description: "튜토리얼 화면에서만 표시되는 예시 행입니다.",
    product_link: null,
    is_real_shipping: true,
    company_name: "튜토리얼 업체",
    option_name: "기본 옵션",
    review_type: "사진 리뷰",
    review_fee: 0,
    planned_depositor_name: null,
    assign_name: "튜토리얼 예시",
    review_photos: [1, 2, 3].map((photoNumber) => ({
      id: `tutorial-demo-photo-${photoNumber}`,
      submission_id: -1001,
      photo_type: "review",
      image_url: "/favicon-180.png"
    })),
    order_number: "TUTORIAL-001",
    buyer_name: "홍길동",
    recipient_name: "홍길동",
    purchase_account: "tutorial@example.com",
    contact: "010-0000-0000",
    address: "튜토리얼 예시 주소",
    bank_name: null,
    bank_account: null,
    account_holder: null,
    amount: 0,
    is_purchase_verified: false,
    is_review_verified: false,
    is_deposit_verified: false,
    deposited_at: null,
    actual_depositor_name: null,
    product_fee_deposit_GB: null,
    review_fee_deposit_GB: null,
    isTutorialDemo: true
  };
}
