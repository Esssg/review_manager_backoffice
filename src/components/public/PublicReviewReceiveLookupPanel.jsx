export default function PublicReviewReceiveLookupPanel({
  isProductLoading,
  productErrorMessage,
  lookupType,
  lookupOptions,
  lookupName,
  onLookupTypeChange,
  onLookupNameChange,
  getLookupTypePlaceholder,
  onSubmit,
  formErrorMessage,
  activeName,
  activeLookupTypeLabel
}) {
  return (
    <section className="dashboard-panel public-review-lookup-panel" aria-label="이름 조회">
      {isProductLoading && <p className="login-message">상품 정보를 확인하는 중...</p>}
      {!isProductLoading && productErrorMessage && <p className="login-error">{productErrorMessage}</p>}
      {!isProductLoading && !productErrorMessage && (
        <>
          <form className="public-review-lookup-form" onSubmit={onSubmit}>
            <label className="public-review-field">
              <span>양식 제출 시 입력한 예금주로 구매 내역 검색</span>
              <div className="public-review-input-combo">
                <select
                  className="public-review-lookup-type-select"
                  value={lookupType}
                  onChange={(event) => onLookupTypeChange(event.target.value)}
                  aria-label="조회 기준"
                >
                  {lookupOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className="public-review-input public-review-input-combo-field"
                  value={lookupName}
                  onChange={(event) => onLookupNameChange(event.target.value)}
                  placeholder={getLookupTypePlaceholder(lookupType)}
                  autoComplete={lookupType === "assign_name" ? "name" : "off"}
                />
              </div>
            </label>
            <button type="submit" className="admin-primary-button">
              조회하기
            </button>
          </form>

          {formErrorMessage && <p className="login-error">{formErrorMessage}</p>}
          {activeName && !formErrorMessage && (
            <p className="public-review-active-name">{`현재 조회 ${activeLookupTypeLabel}: ${activeName}`}</p>
          )}
        </>
      )}
    </section>
  );
}
