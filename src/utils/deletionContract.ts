// @ts-nocheck

export function getDeletionErrorMessage(result, fallback = "삭제 중 오류가 발생했습니다.") {
  const message = result?.error?.message ?? fallback;

  if (!result?.partial) {
    return message;
  }

  return `${message} 일부 관련 데이터가 먼저 삭제되어 최신 상태를 다시 불러옵니다.`;
}
