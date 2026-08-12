import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PublicLoadingIndicator from "@/components/public/PublicLoadingIndicator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

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
    <Card className="dashboard-panel public-review-lookup-panel" aria-label="이름 조회">
      {isProductLoading && <PublicLoadingIndicator label="상품 정보를 확인하는 중..." />}
      {!isProductLoading && productErrorMessage && <p className="login-error">{productErrorMessage}</p>}
      {!isProductLoading && !productErrorMessage && (
        <>
          <form className="public-review-lookup-form" onSubmit={onSubmit}>
            <div className="public-review-field">
              <Label htmlFor="public-review-lookup-name">
                양식 제출 시 입력한 예금주로 구매 내역 검색
              </Label>
              <div className="public-review-input-combo">
                <Select
                  value={lookupType}
                  onValueChange={onLookupTypeChange}
                >
                  <SelectTrigger
                    id="public-review-lookup-type"
                    className="public-review-lookup-type-select"
                    aria-label="조회 기준"
                  >
                    <SelectValue placeholder="조회 기준" />
                  </SelectTrigger>
                  <SelectContent>
                    {lookupOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="public-review-lookup-name"
                  className="public-review-input public-review-input-combo-field"
                  type="text"
                  value={lookupName}
                  onChange={(event) => onLookupNameChange(event.target.value)}
                  placeholder={getLookupTypePlaceholder(lookupType)}
                  autoComplete={lookupType === "assign_name" ? "name" : "off"}
                />
              </div>
            </div>
            <Button type="submit" className="admin-primary-button">
              조회하기
            </Button>
          </form>

          {formErrorMessage && <p className="login-error">{formErrorMessage}</p>}
          {activeName && !formErrorMessage && (
            <p className="public-review-active-name">{`현재 조회 ${activeLookupTypeLabel}: ${activeName}`}</p>
          )}
        </>
      )}
    </Card>
  );
}
