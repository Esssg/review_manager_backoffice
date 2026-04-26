export default function SubmissionInput({
  addSubmissionMessage,
  isAddSubmissionError,
  isAddingSubmission,
  newSubmissionText,
  onAddSubmission,
  onSubmissionTextChange
}) {
  return (
    <div className="submission-inline-slot">
      <div className="submission-input-box">
        <textarea
          rows={3}
          value={newSubmissionText}
          onChange={(event) => onSubmissionTextChange(event.target.value)}
          placeholder={
            "배정명 / 주문번호 / 구매자 / 수취인 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액\n또는\n배정명 / 주문번호 / 구매자 / 수취인 / 연락처 / 주소 / 은행 / 계좌번호 / 입금주 / 금액"
          }
        />
        <button type="button" className="admin-primary-button" onClick={onAddSubmission} disabled={isAddingSubmission}>
          정보 추가하기
        </button>
      </div>
      {addSubmissionMessage && (
        <p className={`submission-input-message${isAddSubmissionError ? " error" : ""}`}>{addSubmissionMessage}</p>
      )}
    </div>
  );
}
