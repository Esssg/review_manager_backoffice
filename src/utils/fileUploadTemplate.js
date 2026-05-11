import * as XLSX from "xlsx";

const TEMPLATE_HEADERS = [
  "날짜",
  "업체명",
  "링크",
  "",
  "채번열",
  "품명",
  "옵션",
  "리뷰형태",
  "배정",
  "주문번호",
  "구매자",
  "수취인",
  "아이디",
  "연락처",
  "주소",
  "계좌",
  "금액",
  "리뷰비",
  "입금자명(예정)",
  "리뷰작성",
  "입금여부",
  "입금일",
  "실제입금자명"
];

const TEMPLATE_ROWS = [
  TEMPLATE_HEADERS,
  [
    "2026-04-30",
    "테스트커머스",
    "",
    "",
    "1",
    "샘플 상품",
    "기본 옵션",
    "포토",
    "홍길동",
    "SAMPLE-ORDER-001",
    "홍길동",
    "홍길동",
    "sample@example.com",
    "01012345678",
    "서울시 테스트구 샘플로 1",
    "국민은행 / 123-456-789 / 홍길동",
    "17,000원",
    "1,000원",
    "0430테스트커머스",
    "FALSE",
    "FALSE",
    "",
    ""
  ],
  [
    "2026-04-30",
    "테스트커머스",
    "",
    "",
    "2",
    "샘플 상품",
    "기본 옵션",
    "실배송",
    "김민지",
    "SAMPLE-ORDER-002",
    "김민지",
    "김민지",
    "sample2@example.com",
    "01098765432",
    "부산시 테스트구 샘플로 2",
    "신한은행 987-654-321 김민지",
    "20,000",
    "0",
    "0430테스트커머스",
    "TRUE",
    "TRUE",
    "2026-05-01",
    "김민지"
  ]
];

function buildTemplateFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const timestamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes())
  ].join("");

  return `리뷰매니저_파일업로드_샘플_${timestamp}.xlsx`;
}

export function downloadFileUploadTemplate() {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(TEMPLATE_ROWS);

  worksheet["!cols"] = TEMPLATE_HEADERS.map((header) => ({
    wch: Math.max(String(header).length + 4, 14)
  }));

  XLSX.utils.book_append_sheet(workbook, worksheet, "파일업로드");
  XLSX.writeFile(workbook, buildTemplateFilename(), {
    bookType: "xlsx",
    compression: true
  });
}
