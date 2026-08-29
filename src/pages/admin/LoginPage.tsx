import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, KeyRound, LoaderCircle, ShieldCheck, UserRound } from "lucide-react";
import AppAlertDialog from "@/components/common/AppAlertDialog";
import { AlertDialogAction } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_STORAGE_KEY } from "@/constants/admin";
import { validateAdminCredentials } from "@/services/adminAuth";
import {
  ADMIN_SESSION_EXPIRY_STORAGE_KEY,
  SESSION_EXPIRY_ALERT
} from "@/services/adminGateway";
import {
  getSessionStorageValue,
  removeSessionStorageValue,
  setLocalStorageValue
} from "@/utils/browserStorage";

const initialForm = {
  loginId: "",
  password: ""
};

function ReviewManagerMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect x="5" y="5" width="54" height="54" rx="15" fill="#0b1726" />
      <path d="M21 14h17l7 7v29H21a3 3 0 0 1-3-3V17a3 3 0 0 1 3-3Z" fill="#f4f1ea" />
      <path d="M38 14v9h9" fill="#d7bf8a" />
      <path d="M38 14v9h9" fill="none" stroke="#0b1726" strokeWidth="2" strokeLinejoin="round" />
      <path d="M26 31h13M26 37h10" fill="none" stroke="#7890a5" strokeWidth="2.5" strokeLinecap="round" />
      <path d="m26 44 4 4 8-9" fill="none" stroke="#b79558" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LoginPage() {
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSessionExpiredDialogOpen, setIsSessionExpiredDialogOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (getSessionStorageValue(ADMIN_SESSION_EXPIRY_STORAGE_KEY) !== "true") {
      return;
    }

    removeSessionStorageValue(ADMIN_SESSION_EXPIRY_STORAGE_KEY);
    setIsSessionExpiredDialogOpen(true);
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await validateAdminCredentials(form.loginId, form.password);

      if (data) {
        setLocalStorageValue(ADMIN_STORAGE_KEY, form.loginId);
        navigate("/admin");
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setErrorMessage("아이디 또는 패스워드를 확인해주세요.");
    } catch (error) {
      setErrorMessage(error.message ?? "로그인 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <main className="login-layout">
      <section className="login-hero">
        <div className="login-hero-content">
          <div className="login-brand">
            <span className="login-brand-mark"><ReviewManagerMark /></span>
            <span className="login-brand-copy">
              <strong>Review Manager</strong>
              <small>OPERATIONS CONSOLE</small>
            </span>
          </div>

          <div className="login-hero-copy">
            <p className="login-hero-kicker">REVIEW OPERATIONS / ADMIN</p>
            <h1>리뷰 운영을<br /><span>정확하게</span> 관리하세요.</h1>
            <p>상품 등록부터 리뷰 진행, 제출 현황과 정산까지 운영에 필요한 정보를 한 곳에서 확인합니다.</p>
          </div>

          <div className="login-hero-footer">
            <span className="login-hero-status"><span className="login-status-dot" />운영 데이터 기반 관리</span>
            <span>SECURE ADMIN ACCESS</span>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit} aria-labelledby="login-title">
          <div className="login-card-header">
            <p className="login-card-kicker">ADMIN ACCESS</p>
            <h2 id="login-title">관리자 로그인</h2>
            <p className="login-card-description">Review Manager 운영 콘솔에 접속합니다.</p>
          </div>

          <div className="login-field">
            <Label htmlFor="loginId">관리자 아이디</Label>
            <div className="login-input-shell">
              <UserRound aria-hidden="true" />
              <Input
                id="loginId"
                name="loginId"
                type="text"
                placeholder="아이디 입력"
                value={form.loginId}
                onChange={handleChange}
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="login-field">
            <Label htmlFor="password">패스워드</Label>
            <div className="login-input-shell">
              <KeyRound aria-hidden="true" />
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="패스워드 입력"
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          <Button type="submit" className="login-submit-button" disabled={isLoading} aria-busy={isLoading}>
            <span>{isLoading ? "로그인 확인 중" : "운영 콘솔 접속"}</span>
            {isLoading ? <LoaderCircle className="login-submit-icon login-spinner" aria-hidden="true" /> : <ArrowRight className="login-submit-icon" aria-hidden="true" />}
          </Button>
          {isLoading && <p className="login-message" role="status">로그인 정보를 확인하고 있습니다.</p>}
          {!isLoading && errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}

          <p className="login-security-note"><ShieldCheck aria-hidden="true" /> 승인된 관리자 계정만 접근할 수 있습니다.</p>
        </form>
      </section>
      </main>
      <AppAlertDialog
        isOpen={isSessionExpiredDialogOpen}
        badgeLabel="세션 만료"
        title="재 로그인이 필요합니다."
        description={SESSION_EXPIRY_ALERT}
        ariaLabel="인증 시간 만료 안내"
        actionsChildren={(
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              setIsSessionExpiredDialogOpen(false);
            }}
          >
            확인
          </AlertDialogAction>
        )}
        onCancel={() => setIsSessionExpiredDialogOpen(false)}
        onConfirm={() => setIsSessionExpiredDialogOpen(false)}
      />
    </>
  );
}
