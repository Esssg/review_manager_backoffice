import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_STORAGE_KEY } from "@/constants/admin";
import { ADMIN_ROLE, ADMIN_SETTING_KEY } from "@/constants/adminAccess";
import { useAdminAccessContext } from "@/contexts/AdminAccessContext";
import {
  fetchAdminAccessSettings,
  fetchAdminSetting,
  updateAdminAccessSetting,
  updateAdminSetting
} from "@/services/adminSettings";
import { isAdminGatewayConfigured } from "@/services/adminGateway";
import { getLocalStorageValue } from "@/utils/browserStorage";
import {
  normalizeSettingValue,
  readResolvedSetting,
  validateSettingForScope
} from "@/utils/settingsResolver";

type PasswordFieldName = "newPassword" | "confirmPassword";

type PasswordForm = {
  newPassword: string;
  confirmPassword: string;
};

type AdminFormData = {
  username: string;
  phone_number: string;
  email: string;
  company: string;
};

type AdminSetting = AdminFormData & {
  login_id?: string | null;
};

type PasswordInputProps = {
  id: string;
  label: string;
  name: PasswordFieldName;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  isVisible: boolean;
  onRevealStart: (fieldName: PasswordFieldName) => void;
  onRevealEnd: () => void;
  disabled: boolean;
  autoComplete: string;
};

type AlertDialogState = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  isLoading: boolean;
  onConfirm: (() => void | Promise<void>) | null;
  variant: "normal" | "danger" | "info";
};

const EMPTY_PASSWORD_FORM: PasswordForm = {
  newPassword: "",
  confirmPassword: ""
};

function EyeIcon({ isActive }: { isActive: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M2.75 12s3.25-6.25 9.25-6.25S21.25 12 21.25 12 18 18.25 12 18.25 2.75 12 2.75 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r={isActive ? "3.2" : "2.4"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function PasswordInput({
  id,
  label,
  name,
  value,
  onChange,
  isVisible,
  onRevealStart,
  onRevealEnd,
  disabled,
  autoComplete
}: PasswordInputProps) {
  const handleRevealKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    onRevealStart(name);
  };

  const handleRevealKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    onRevealEnd();
  };

  return (
    <div className="form-group">
      <Label htmlFor={id}>{label}</Label>
      <div className="password-input-row">
        <Input
          id={id}
          type={isVisible ? "text" : "password"}
          name={name}
          value={value}
          onChange={onChange}
          placeholder="********"
          className="form-input password-form-input"
          aria-label={label}
          autoComplete={autoComplete}
          disabled={disabled}
        />
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className={`password-visibility-button${isVisible ? " is-active" : ""}`}
          onMouseDown={(event) => {
            event.preventDefault();
            onRevealStart(name);
          }}
          onMouseUp={onRevealEnd}
          onMouseLeave={onRevealEnd}
          onTouchStart={() => onRevealStart(name)}
          onTouchEnd={onRevealEnd}
          onTouchCancel={onRevealEnd}
          onKeyDown={handleRevealKeyDown}
          onKeyUp={handleRevealKeyUp}
          onBlur={onRevealEnd}
          aria-label={`${label} 보기`}
          title="누르고 있는 동안 비밀번호 보기"
          disabled={disabled || !value}
        >
          <EyeIcon isActive={isVisible} />
        </Button>
      </div>
    </div>
  );
}

export default function AdminSettingPage() {
  const adminId = getLocalStorageValue(ADMIN_STORAGE_KEY);

  if (!adminId) {
    return <Navigate to="/admin/login" replace />;
  }

  return <AuthenticatedAdminSettingPage adminId={adminId} />;
}

function AuthenticatedAdminSettingPage({ adminId }: { adminId: string }) {
  const navigate = useNavigate();
  const adminAccess = useAdminAccessContext();
  const adminRole = adminAccess?.role ?? null;
  const canEditCompanySettings =
    adminRole === ADMIN_ROLE.DEVELOPER || adminRole === ADMIN_ROLE.COMPANY_ADMIN;
  const settingsScope = canEditCompanySettings ? "company" : "admin";
  const defaultSettingForm = useMemo(
    () => ({
      companyNameTrimLength: (() => {
        const result = normalizeSettingValue(
          ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH,
          readResolvedSetting(
            adminAccess?.settings,
            ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH,
            0
          )
        );

        return result.ok ? result.value : 0;
      })(),
      productFeeDepositParty: readResolvedSetting(
        adminAccess?.settings,
        ADMIN_SETTING_KEY.PRODUCT_FEE_DEPOSIT_PARTY,
        "self"
      ),
      reviewFeeDepositParty: readResolvedSetting(
        adminAccess?.settings,
        ADMIN_SETTING_KEY.REVIEW_FEE_DEPOSIT_PARTY,
        "self"
      )
    }),
    [adminAccess?.settings]
  );
  const settingsInitialRef = useRef(defaultSettingForm);
  const [settingsForm, setSettingsForm] = useState(defaultSettingForm);
  const [settingsError, setSettingsError] = useState("");
  const [settingsLoadedFromGateway, setSettingsLoadedFromGateway] = useState(false);
  const [personalSettingsReset, setPersonalSettingsReset] = useState(false);

  const [adminData, setAdminData] = useState<AdminSetting | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isPasswordChangeOpen, setIsPasswordChangeOpen] = useState(false);
  const [visiblePasswordField, setVisiblePasswordField] = useState<PasswordFieldName | null>(null);

  const [formData, setFormData] = useState<AdminFormData>({
    username: "",
    phone_number: "",
    email: "",
    company: ""
  });

  const [passwordForm, setPasswordForm] = useState<PasswordForm>(EMPTY_PASSWORD_FORM);

  const [alertDialog, setAlertDialog] = useState<AlertDialogState>({
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "확인",
    cancelLabel: "취소",
    isLoading: false,
    onConfirm: null,
    variant: "normal"
  });

  useEffect(() => {
    settingsInitialRef.current = defaultSettingForm;
    setSettingsForm(defaultSettingForm);
  }, [defaultSettingForm]);

  useEffect(() => {
    if (!isAdminGatewayConfigured() || adminAccess?.settings?.length) {
      return;
    }

    let isMounted = true;

    const loadSettings = async () => {
      const result = await fetchAdminAccessSettings();

      if (!isMounted || result.error || !result.data?.length) {
        return;
      }

      const nextForm = {
        companyNameTrimLength: readResolvedSetting(
          result.data,
          ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH,
          0
        ),
        productFeeDepositParty: readResolvedSetting(
          result.data,
          ADMIN_SETTING_KEY.PRODUCT_FEE_DEPOSIT_PARTY,
          "self"
        ),
        reviewFeeDepositParty: readResolvedSetting(
          result.data,
          ADMIN_SETTING_KEY.REVIEW_FEE_DEPOSIT_PARTY,
          "self"
        )
      };

      settingsInitialRef.current = nextForm;
      setSettingsForm(nextForm);
      setSettingsLoadedFromGateway(true);
    };

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, [adminAccess?.settings]);

  useEffect(() => {
    const fetchAdminData = async () => {
      setIsLoading(true);
      setLoadError("");
      const { data, error } = await fetchAdminSetting(adminId);

      if (error) {
        setLoadError(`관리자 정보를 불러올 수 없습니다: ${error.message}`);
        setIsLoading(false);
        return;
      }

      setAdminData(data);
      setFormData({
        username: data.username || "",
        phone_number: data.phone_number || "",
        email: data.email || "",
        company: data.company || ""
      });
      setIsLoading(false);
    };

    fetchAdminData();
  }, [adminId]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePasswordInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordForm(prev => ({
      ...prev,
      [name]: value
    }));
    setSaveError("");
    setSaveSuccess(false);
  };

  const validatePasswordChange = () => {
    if (!isPasswordChangeOpen) {
      return "";
    }

    const hasNewPassword = passwordForm.newPassword.length > 0;
    const hasConfirmPassword = passwordForm.confirmPassword.length > 0;

    if (!hasNewPassword && !hasConfirmPassword) {
      return "";
    }

    if (!hasNewPassword) {
      return "변경할 비밀번호를 입력해주세요.";
    }

    if (!hasConfirmPassword) {
      return "비밀번호 확인을 입력해주세요.";
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return "비밀번호와 비밀번호 확인이 일치하지 않습니다.";
    }

    return "";
  };

  const validateAccessSettings = () => {
    if (!adminRole) {
      return "";
    }

    const entries = [
      ...(canEditCompanySettings
        ? [
            {
              key: ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH,
              value: settingsForm.companyNameTrimLength
            }
          ]
        : []),
      {
        key: ADMIN_SETTING_KEY.PRODUCT_FEE_DEPOSIT_PARTY,
        value: settingsForm.productFeeDepositParty
      },
      {
        key: ADMIN_SETTING_KEY.REVIEW_FEE_DEPOSIT_PARTY,
        value: settingsForm.reviewFeeDepositParty
      }
    ];

    for (const entry of entries) {
      const result = validateSettingForScope(entry.key, entry.value, settingsScope);

      if (!result.ok) {
        return result.errorMessage;
      }
    }

    return "";
  };

  const getValidatedAccessSettingEntries = () => {
    if (!adminRole) {
      return [];
    }

    const entries = [
      ...(canEditCompanySettings
        ? [
            {
              key: ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH,
              value: settingsForm.companyNameTrimLength
            }
          ]
        : []),
      {
        key: ADMIN_SETTING_KEY.PRODUCT_FEE_DEPOSIT_PARTY,
        value: settingsForm.productFeeDepositParty
      },
      {
        key: ADMIN_SETTING_KEY.REVIEW_FEE_DEPOSIT_PARTY,
        value: settingsForm.reviewFeeDepositParty
      }
    ];

    return entries.map((entry) => {
      const result = validateSettingForScope(entry.key, entry.value, settingsScope);

      return {
        ...entry,
        value: result.ok ? result.value : entry.value
      };
    });
  };

  const hasAccessSettingChanges = Boolean(
    adminRole &&
      getValidatedAccessSettingEntries().some((entry) => {
        const initialKey =
          entry.key === ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH
            ? "companyNameTrimLength"
            : entry.key === ADMIN_SETTING_KEY.PRODUCT_FEE_DEPOSIT_PARTY
              ? "productFeeDepositParty"
              : "reviewFeeDepositParty";

        return entry.value !== settingsInitialRef.current[initialKey];
      })
  );

  const hasPersonalSettingOverrides = useMemo(
    () =>
      adminRole === ADMIN_ROLE.EMPLOYEE &&
      (adminAccess?.settings ?? []).some(
        (row) =>
          (row?.key ?? row?.setting_key ?? row?.settingKey) &&
          (row?.hasOverride === true || row?.has_override === true || row?.source === "admin")
      ),
    [adminAccess?.settings, adminRole]
  );

  const handleSave = async () => {
    setSaveError("");
    setSaveSuccess(false);

    const passwordValidationError = validatePasswordChange();
    if (passwordValidationError) {
      setSaveError(passwordValidationError);
      return;
    }

    const settingsValidationError = validateAccessSettings();
    if (settingsValidationError) {
      setSettingsError(settingsValidationError);
      setSaveError(settingsValidationError);
      return;
    }

    setIsSaving(true);
    setSettingsError("");

    const updatePayload: Partial<AdminFormData> & { password?: string } = {
      username: formData.username,
      phone_number: formData.phone_number,
      email: formData.email,
      company: formData.company
    };

    if (isPasswordChangeOpen && passwordForm.newPassword) {
      updatePayload.password = passwordForm.newPassword;
    }

    const { error } = await updateAdminSetting(adminId, updatePayload);

    if (error) {
      setSaveError(`저장 실패: ${error.message}`);
      setIsSaving(false);
      return;
    }

    if (isAdminGatewayConfigured() && adminRole && hasAccessSettingChanges) {
      const normalizedEntries = getValidatedAccessSettingEntries();
      const settingsToSave = normalizedEntries.filter(
        (entry) =>
          entry.value !==
          settingsInitialRef.current[
            entry.key === ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH
              ? "companyNameTrimLength"
              : entry.key === ADMIN_SETTING_KEY.PRODUCT_FEE_DEPOSIT_PARTY
                ? "productFeeDepositParty"
                : "reviewFeeDepositParty"
          ]
      );

      for (const entry of settingsToSave) {
        const result = await updateAdminAccessSetting({
          key: entry.key,
          settingKey: entry.key,
          value: entry.value,
          scopeType: settingsScope
        });

        if (result.error) {
          setIsSaving(false);
          setSettingsError(`DB 설정 저장 실패: ${result.error.message}`);
          setSaveError(`DB 설정 저장 실패: ${result.error.message}`);
          return;
        }
      }

      const normalizedForm = {
        ...settingsForm,
        companyNameTrimLength:
          normalizedEntries.find((entry) => entry.key === ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH)?.value ??
          settingsForm.companyNameTrimLength,
        productFeeDepositParty:
          normalizedEntries.find((entry) => entry.key === ADMIN_SETTING_KEY.PRODUCT_FEE_DEPOSIT_PARTY)?.value ??
          settingsForm.productFeeDepositParty,
        reviewFeeDepositParty:
          normalizedEntries.find((entry) => entry.key === ADMIN_SETTING_KEY.REVIEW_FEE_DEPOSIT_PARTY)?.value ??
          settingsForm.reviewFeeDepositParty
      };
      settingsInitialRef.current = normalizedForm;
      setSettingsForm(normalizedForm);
    }

    setIsSaving(false);

    setPasswordForm(EMPTY_PASSWORD_FORM);
    setIsPasswordChangeOpen(false);
    setVisiblePasswordField(null);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleResetPersonalSettings = async () => {
    if (adminRole !== ADMIN_ROLE.EMPLOYEE || !isAdminGatewayConfigured()) {
      setSettingsError("개인 설정 해제는 gateway가 활성화된 임직원 계정에서만 사용할 수 있습니다.");
      return;
    }

    setIsSaving(true);
    setSettingsError("");
    setSaveError("");

    const keys = [
      ADMIN_SETTING_KEY.PRODUCT_FEE_DEPOSIT_PARTY,
      ADMIN_SETTING_KEY.REVIEW_FEE_DEPOSIT_PARTY
    ];

    for (const key of keys) {
      const result = await updateAdminAccessSetting({
        key,
        settingKey: key,
        scopeType: "admin",
        scopeId: adminId,
        remove: true
      });

      if (result.error) {
        setIsSaving(false);
        setSettingsError(`개인 설정 해제 실패: ${result.error.message}`);
        setSaveError(`개인 설정 해제 실패: ${result.error.message}`);
        return;
      }
    }

    const refreshed = await fetchAdminAccessSettings();
    if (refreshed.error) {
      setIsSaving(false);
      setSettingsError(`회사 기본값을 다시 불러오지 못했습니다: ${refreshed.error.message}`);
      setSaveError(`개인 설정 해제는 완료됐지만 화면을 갱신하지 못했습니다: ${refreshed.error.message}`);
      return;
    }

    const nextForm = {
      companyNameTrimLength: readResolvedSetting(
        refreshed.data,
        ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH,
        0
      ),
      productFeeDepositParty: readResolvedSetting(
        refreshed.data,
        ADMIN_SETTING_KEY.PRODUCT_FEE_DEPOSIT_PARTY,
        "self"
      ),
      reviewFeeDepositParty: readResolvedSetting(
        refreshed.data,
        ADMIN_SETTING_KEY.REVIEW_FEE_DEPOSIT_PARTY,
        "self"
      )
    };
    settingsInitialRef.current = nextForm;
    setSettingsForm(nextForm);
    setPersonalSettingsReset(true);
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const openConfirmDialog = () => {
    const passwordValidationError = validatePasswordChange();
    if (passwordValidationError) {
      setSaveError(passwordValidationError);
      setSaveSuccess(false);
      return;
    }

    const settingsValidationError = validateAccessSettings();
    if (settingsValidationError) {
      setSettingsError(settingsValidationError);
      setSaveError(settingsValidationError);
      setSaveSuccess(false);
      return;
    }

    const hasPasswordChange = isPasswordChangeOpen && passwordForm.newPassword.length > 0;

    setAlertDialog({
      isOpen: true,
      title: "정보 저장 확인",
      message: hasPasswordChange
        ? "변경된 정보와 비밀번호를 저장하시겠습니까?"
        : hasAccessSettingChanges
          ? "변경된 프로필과 DB 설정을 저장하시겠습니까?"
          : "변경된 정보를 저장하시겠습니까?",
      confirmLabel: "저장",
      cancelLabel: "취소",
      isLoading: false,
      onConfirm: handleSave,
      variant: "normal"
    });
  };

  const closeDialog = () => {
    setAlertDialog(prev => ({
      ...prev,
      isOpen: false
    }));
  };

  const openPasswordChange = () => {
    setIsPasswordChangeOpen(true);
    setSaveError("");
    setSaveSuccess(false);
  };

  const cancelPasswordChange = () => {
    setPasswordForm(EMPTY_PASSWORD_FORM);
    setIsPasswordChangeOpen(false);
    setVisiblePasswordField(null);
    setSaveError("");
  };

  if (isLoading) {
    return (
      <section className="dashboard-panel">
        <p className="login-message">관리자 정보를 불러오는 중...</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="dashboard-panel">
        <p className="login-error">{loadError}</p>
      </section>
    );
  }

  if (!adminData) {
    return (
      <section className="dashboard-panel">
        <p className="login-message">관리자 정보를 찾을 수 없습니다.</p>
      </section>
    );
  }

  return (
    <section className="admin-setting-page">
      <Card className="admin-setting-container gap-0 py-0">
        <h1>관리자 정보 설정</h1>
        
        <div className="admin-setting-section">
          <h2>기본 정보</h2>
          
          <div className="form-group">
            <Label htmlFor="login-id">로그인 ID</Label>
            <Input
              id="login-id"
              type="text"
              value={adminId}
              disabled
              className="form-input"
              aria-label="로그인 ID (읽기 전용)"
            />
          </div>

          <div className="form-group">
            <Label htmlFor="username">이름</Label>
            <Input
              id="username"
              type="text"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              placeholder="이름을 입력하세요"
              className="form-input"
              aria-label="관리자 이름"
            />
          </div>

          <div className="form-group">
            <Label htmlFor="phone-number">연락처</Label>
            <Input
              id="phone-number"
              type="tel"
              name="phone_number"
              value={formData.phone_number}
              onChange={handleInputChange}
              placeholder="010-1234-5678"
              className="form-input"
              aria-label="연락처"
            />
          </div>

          <div className="form-group">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="example@email.com"
              className="form-input"
              aria-label="이메일"
            />
          </div>

          <div className="form-group">
            <Label htmlFor="company">회사</Label>
            <Input
              id="company"
              type="text"
              name="company"
              value={formData.company}
              disabled
              placeholder="회사명을 입력하세요"
              className="form-input"
              aria-label="회사 (읽기 전용)"
            />
          </div>
        </div>

        {adminRole && (
          <div className="admin-setting-section">
            <div className="admin-setting-section-header">
              <h2>{canEditCompanySettings ? "회사·상품 기본값" : "내 웹·상품 기본값"}</h2>
              {canEditCompanySettings && isAdminGatewayConfigured() && (
                <Button
                  variant="outline"
                  type="button"
                  className="admin-secondary-button"
                  onClick={() => navigate("/admin/setting/access")}
                  disabled={isSaving}
                >
                  임직원 권한 관리
                </Button>
              )}
            </div>
            <p className="admin-setting-muted">
              {settingsLoadedFromGateway || adminAccess?.settings?.length
                ? "DB에 저장된 상속값입니다. 저장하지 않은 입력값은 현재 작업에만 적용됩니다."
                : "현재는 호환 모드입니다. gateway가 활성화되면 이 값이 DB에 저장됩니다."}
            </p>

            {canEditCompanySettings && (
              <div className="form-group">
                <Label htmlFor="company-name-trim-length">예정 입금자명 회사명 자르기</Label>
                <Input
                  id="company-name-trim-length"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={settingsForm.companyNameTrimLength}
                  onChange={(event) => {
                    setSettingsForm((previous) => ({
                      ...previous,
                      companyNameTrimLength: event.target.value
                    }));
                    setPersonalSettingsReset(false);
                    setSettingsError("");
                    setSaveError("");
                  }}
                  className="form-input"
                  aria-describedby="company-name-trim-length-help"
                  disabled={isSaving}
                />
                <p id="company-name-trim-length-help" className="admin-setting-muted">
                  0이면 회사명 전체, 1~100이면 앞 글자만 표시합니다. 100을 초과하면 저장되지 않습니다.
                </p>
              </div>
            )}

            <div className="form-group">
              <Label htmlFor="product-fee-deposit-party">제품비 입금구분 기본값</Label>
              <select
                id="product-fee-deposit-party"
                className="form-input"
                value={settingsForm.productFeeDepositParty}
                onChange={(event) => {
                  setSettingsForm((previous) => ({
                    ...previous,
                    productFeeDepositParty: event.target.value
                  }));
                  setPersonalSettingsReset(false);
                  setSettingsError("");
                  setSaveError("");
                }}
                disabled={isSaving}
              >
                <option value="self">자체입금</option>
                <option value="company">업체입금</option>
              </select>
            </div>

            <div className="form-group">
              <Label htmlFor="review-fee-deposit-party">리뷰비 입금구분 기본값</Label>
              <select
                id="review-fee-deposit-party"
                className="form-input"
                value={settingsForm.reviewFeeDepositParty}
                onChange={(event) => {
                  setSettingsForm((previous) => ({
                    ...previous,
                    reviewFeeDepositParty: event.target.value
                  }));
                  setPersonalSettingsReset(false);
                  setSettingsError("");
                  setSaveError("");
                }}
                disabled={isSaving}
              >
                <option value="self">자체입금</option>
                <option value="company">없음</option>
              </select>
            </div>

            {settingsError && <p className="admin-setting-error" role="alert">{settingsError}</p>}

            {adminRole === ADMIN_ROLE.EMPLOYEE && hasPersonalSettingOverrides && !personalSettingsReset && (
              <div className="admin-setting-reset-row">
                <p className="admin-setting-muted">
                  개인 override를 해제하면 회사 기본값을 다시 사용합니다. 기존 상품·제출 값은 변경되지 않습니다.
                </p>
                <Button
                  variant="outline"
                  type="button"
                  className="admin-secondary-button"
                  onClick={() => {
                    setAlertDialog({
                      isOpen: true,
                      title: "개인 설정 해제",
                      message: "개인 설정 override를 모두 해제하고 회사 기본값을 사용하시겠습니까?",
                      confirmLabel: "해제",
                      cancelLabel: "취소",
                      isLoading: false,
                      onConfirm: handleResetPersonalSettings,
                      variant: "danger"
                    });
                  }}
                  disabled={isSaving}
                >
                  회사 기본값 다시 사용
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="admin-setting-section">
          <div className="admin-setting-section-header">
            <h2>비밀번호</h2>
            {!isPasswordChangeOpen && (
              <Button
                variant="outline"
                type="button"
                className="admin-secondary-button admin-password-change-button"
                onClick={openPasswordChange}
                disabled={isSaving}
              >
                비밀번호 변경하기
              </Button>
            )}
          </div>

          {isPasswordChangeOpen ? (
            <div className="admin-password-change-panel">
              <PasswordInput
                id="new-password"
                label="변경할 비밀번호"
                name="newPassword"
                value={passwordForm.newPassword}
                onChange={handlePasswordInputChange}
                isVisible={visiblePasswordField === "newPassword"}
                onRevealStart={setVisiblePasswordField}
                onRevealEnd={() => setVisiblePasswordField(null)}
                disabled={isSaving}
                autoComplete="new-password"
              />

              <PasswordInput
                id="confirm-password"
                label="비밀번호 확인"
                name="confirmPassword"
                value={passwordForm.confirmPassword}
                onChange={handlePasswordInputChange}
                isVisible={visiblePasswordField === "confirmPassword"}
                onRevealStart={setVisiblePasswordField}
                onRevealEnd={() => setVisiblePasswordField(null)}
                disabled={isSaving}
                autoComplete="new-password"
              />

              <Button
                variant="link"
                type="button"
                className="admin-link-button admin-password-cancel-button"
                onClick={cancelPasswordChange}
                disabled={isSaving}
              >
                비밀번호 변경 취소
              </Button>
            </div>
          ) : (
            <p className="admin-setting-muted">비밀번호는 보안을 위해 표시하지 않습니다.</p>
          )}
        </div>

        {saveError && (
          <p className="admin-setting-error">{saveError}</p>
        )}

        {saveSuccess && (
          <p className="admin-setting-success">정보가 저장되었습니다.</p>
        )}

        <div className="admin-setting-buttons">
          <Button
            variant="default"
            type="button"
            className="admin-setting-save-button"
            onClick={openConfirmDialog}
            disabled={isSaving}
            aria-label="정보 저장"
          >
            {isSaving ? "저장 중..." : "저장"}
          </Button>
          <Button
            variant="outline"
            type="button"
            className="admin-setting-cancel-button"
            onClick={() => navigate("/admin")}
            disabled={isSaving}
            aria-label="취소하고 돌아가기"
          >
            취소
          </Button>
        </div>
      </Card>

      <AlertDialog
        open={alertDialog.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen && !isSaving) {
            closeDialog();
          }
        }}
      >
        <AlertDialogContent
          onEscapeKeyDown={(event) => {
            if (isSaving) {
              event.preventDefault();
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{alertDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{alertDialog.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDialog} disabled={isSaving}>
              {alertDialog.cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={alertDialog.variant === "danger" ? "destructive" : "default"}
              onClick={(event) => {
                event.preventDefault();
                alertDialog.onConfirm?.();
                closeDialog();
              }}
              disabled={isSaving}
            >
              {isSaving ? "저장 중..." : alertDialog.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
