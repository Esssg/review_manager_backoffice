import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ADMIN_STORAGE_KEY } from "../../constants/admin";
import { supabase } from "../../lib/supabase";
import AppAlertDialog from "../../components/common/AppAlertDialog";

export default function AdminSettingPage() {
  const navigate = useNavigate();
  const adminId = localStorage.getItem(ADMIN_STORAGE_KEY);
  
  const [adminData, setAdminData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [formData, setFormData] = useState({
    username: "",
    phone_number: "",
    email: "",
    company: ""
  });

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

  const handleSave = async () => {
    setSaveError("");
    setSaveSuccess(false);
    setIsSaving(true);

    const { error } = await supabase
      .from("admins")
      .update({
        username: formData.username,
        phone_number: formData.phone_number,
        email: formData.email,
        company: formData.company
      })
      .eq("login_id", adminId);

    setIsSaving(false);

    if (error) {
      setSaveError(`저장 실패: ${error.message}`);
      return;
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const openConfirmDialog = () => {
    setAlertDialog({
      isOpen: true,
      title: "정보 저장 확인",
      message: "변경된 정보를 저장하시겠습니까?",
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
