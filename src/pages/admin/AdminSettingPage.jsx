import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ADMIN_STORAGE_KEY } from "../../constants/admin";
import { supabase } from "../../lib/supabase";
import AppAlertDialog from "../../components/common/AppAlertDialog";

const EMPTY_PASSWORD_FORM = {
  newPassword: "",
  confirmPassword: ""
};

function EyeIcon({ isActive }) {
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
}) {
  const handleRevealKeyDown = (event) => {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    onRevealStart(name);
  };

  const handleRevealKeyUp = (event) => {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    onRevealEnd();
  };

  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <div className="password-input-row">
        <input
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
        <button
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
        </button>
      </div>
    </div>
  );
}

export default function AdminSettingPage() {
  const navigate = useNavigate();
  const adminId = localStorage.getItem(ADMIN_STORAGE_KEY);
  
  const [adminData, setAdminData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isPasswordChangeOpen, setIsPasswordChangeOpen] = useState(false);
  const [visiblePasswordField, setVisiblePasswordField] = useState(null);

  const [formData, setFormData] = useState({
    username: "",
    phone_number: "",
    email: "",
    company: ""
  });

  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);

  const [alertDialog, setAlertDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "확인",
    cancelLabel: "취소",
    isLoading: false,
    onConfirm: null,
    variant: "normal"
  });

  if (!adminId) {
    navigate("/admin/login", { replace: true });
    return null;
  }

  useEffect(() => {
    const fetchAdminData = async () => {
      setIsLoading(true);
      setLoadError("");
      const { data, error } = await supabase
        .from("admins")
        .select("login_id,username,phone_number,email,company")
        .eq("login_id", adminId)
        .single();

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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePasswordInputChange = (e) => {
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

  const handleSave = async () => {
    setSaveError("");
    setSaveSuccess(false);

    const passwordValidationError = validatePasswordChange();
    if (passwordValidationError) {
      setSaveError(passwordValidationError);
      return;
    }

    setIsSaving(true);

    const updatePayload = {
      username: formData.username,
      phone_number: formData.phone_number,
      email: formData.email,
      company: formData.company
    };

    if (isPasswordChangeOpen && passwordForm.newPassword) {
      updatePayload.password = passwordForm.newPassword;
    }

    const { error } = await supabase
      .from("admins")
      .update(updatePayload)
      .eq("login_id", adminId);

    setIsSaving(false);

    if (error) {
      setSaveError(`저장 실패: ${error.message}`);
      return;
    }

    setPasswordForm(EMPTY_PASSWORD_FORM);
    setIsPasswordChangeOpen(false);
    setVisiblePasswordField(null);
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

    const hasPasswordChange = isPasswordChangeOpen && passwordForm.newPassword.length > 0;

    setAlertDialog({
      isOpen: true,
      title: "정보 저장 확인",
      message: hasPasswordChange
        ? "변경된 정보와 비밀번호를 저장하시겠습니까?"
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
      <div className="admin-setting-container">
        <h1>관리자 정보 설정</h1>
        
        <div className="admin-setting-section">
          <h2>기본 정보</h2>
          
          <div className="form-group">
            <label htmlFor="login-id">로그인 ID</label>
            <input
              id="login-id"
              type="text"
              value={adminId}
              disabled
              className="form-input"
              aria-label="로그인 ID (읽기 전용)"
            />
          </div>

          <div className="form-group">
            <label htmlFor="username">이름</label>
            <input
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
            <label htmlFor="phone-number">연락처</label>
            <input
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
            <label htmlFor="email">이메일</label>
            <input
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
            <label htmlFor="company">회사</label>
            <input
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

        <div className="admin-setting-section">
          <div className="admin-setting-section-header">
            <h2>비밀번호</h2>
            {!isPasswordChangeOpen && (
              <button
                type="button"
                className="admin-secondary-button admin-password-change-button"
                onClick={openPasswordChange}
                disabled={isSaving}
              >
                비밀번호 변경하기
              </button>
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

              <button
                type="button"
                className="admin-link-button admin-password-cancel-button"
                onClick={cancelPasswordChange}
                disabled={isSaving}
              >
                비밀번호 변경 취소
              </button>
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
          <button
            type="button"
            className="admin-setting-save-button"
            onClick={openConfirmDialog}
            disabled={isSaving}
            aria-label="정보 저장"
          >
            {isSaving ? "저장 중..." : "저장"}
          </button>
          <button
            type="button"
            className="admin-setting-cancel-button"
            onClick={() => navigate("/admin")}
            disabled={isSaving}
            aria-label="취소하고 돌아가기"
          >
            취소
          </button>
        </div>
      </div>

      <AppAlertDialog
        isOpen={alertDialog.isOpen}
        title={alertDialog.title}
        message={alertDialog.message}
        confirmLabel={alertDialog.confirmLabel}
        cancelLabel={alertDialog.cancelLabel}
        isLoading={isSaving}
        onConfirm={() => {
          if (alertDialog.onConfirm) {
            alertDialog.onConfirm();
          }
          closeDialog();
        }}
        onCancel={closeDialog}
        variant={alertDialog.variant}
      />
    </section>
  );
}
