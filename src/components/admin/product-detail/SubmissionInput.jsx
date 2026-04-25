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
          placeholder="주문번호/구매자/수령인/구매계정/연락처/주소/계좌정보/금액"
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
