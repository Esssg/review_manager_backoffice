import { useId } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type AdminProfile = {
  loginId?: string | null;
  username?: string | null;
  email?: string | null;
};

type AdminScopeCardProps = {
  adminId?: string | null;
  adminProfile?: AdminProfile | null;
  includeCompanyData?: boolean;
  scopeMessage?: string;
  isCompanyScopeAvailable?: boolean;
  onIncludeCompanyDataChange?: (event: { target: { checked: boolean } }) => void;
  disableWhenUnavailable?: boolean;
  className?: string;
};

export default function AdminScopeCard({
  adminId = null,
  adminProfile = null,
  includeCompanyData = false,
  scopeMessage = "",
  isCompanyScopeAvailable = true,
  onIncludeCompanyDataChange = () => {},
  disableWhenUnavailable = false,
  className = ""
}: AdminScopeCardProps) {
  const groupId = useId();
  const scopeValue = includeCompanyData && isCompanyScopeAvailable ? "company" : "personal";
  const scopeModeLabel = scopeValue === "company" ? "내 회사 전체" : "내 계정 데이터";
  const isScopeDisabled = disableWhenUnavailable && !isCompanyScopeAvailable;
  const loginId = String(adminProfile?.loginId ?? adminId ?? "").trim();
  const username = String(adminProfile?.username ?? "").trim();
  const accountName = username || loginId || "확인 중";
  const accountIdLabel = loginId ? `계정 ${loginId}` : "계정 확인 중";

  const handleScopeChange = (value: string) => {
    if (value !== "personal" && value !== "company") {
      return;
    }

    onIncludeCompanyDataChange({ target: { checked: value === "company" } });
  };

  return (
    <div className={`admin-scope-card ${className}`.trim()}>
      <div className="admin-scope-card-heading">
        <span className="admin-scope-card-label">조회 범위</span>
        <span className="admin-scope-card-mode">{scopeModeLabel}</span>
      </div>
      <div className="admin-scope-card-content">
        <RadioGroup
          value={scopeValue}
          onValueChange={handleScopeChange}
          className="admin-scope-card-options"
          aria-label="조회 범위"
        >
          <label className={`admin-scope-card-option ${scopeValue === "personal" ? "is-selected" : ""}`.trim()} htmlFor={`${groupId}-personal`}>
            <RadioGroupItem id={`${groupId}-personal`} value="personal" />
            <span>내 계정 데이터</span>
          </label>
          <label
            className={`admin-scope-card-option ${scopeValue === "company" ? "is-selected" : ""} ${!isCompanyScopeAvailable ? "is-disabled" : ""}`.trim()}
            htmlFor={`${groupId}-company`}
          >
            <RadioGroupItem id={`${groupId}-company`} value="company" disabled={isScopeDisabled || !isCompanyScopeAvailable} />
            <span>내 회사 전체</span>
          </label>
        </RadioGroup>
        <div className="admin-scope-card-account" aria-label="현재 로그인 계정">
          <span className="admin-scope-card-account-label">현재 로그인</span>
          <strong className="admin-scope-card-account-name" title={accountName}>{accountName}</strong>
          <span className="admin-scope-card-account-id" title={accountIdLabel}>{accountIdLabel}</span>
        </div>
      </div>
      {scopeMessage ? <p className="admin-scope-card-message">{scopeMessage}</p> : null}
    </div>
  );
}
