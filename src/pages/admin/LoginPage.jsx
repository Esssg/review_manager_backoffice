import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ADMIN_STORAGE_KEY } from "../../constants/admin";
import { validateAdminCredentials } from "../../services/adminAuth";

const initialForm = {
  loginId: "",
  password: ""
};

export default function LoginPage() {
  const [form, setForm] = useState(initialForm);
  const [cursor, setCursor] = useState({ x: -9999, y: -9999 });
  const [heroSize, setHeroSize] = useState({ width: 0, height: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();
  const bubbles = useMemo(
    () => [
      { id: 1, x: 18, y: 20, size: 74 },
      { id: 2, x: 36, y: 58, size: 46 },
      { id: 3, x: 52, y: 30, size: 62 },
      { id: 4, x: 74, y: 20, size: 54 },
      { id: 5, x: 68, y: 62, size: 84 },
      { id: 6, x: 28, y: 80, size: 58 }
    ],
    []
  );

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
        localStorage.setItem(ADMIN_STORAGE_KEY, form.loginId);
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

  const handleHeroMouseMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHeroSize({ width: rect.width, height: rect.height });
    setCursor({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    });
  };

  return (
    <main className="login-layout">
      <section className="login-hero" onMouseMove={handleHeroMouseMove} aria-hidden="true">
        <div className="gradient-orb orb-a" />
        <div className="gradient-orb orb-b" />
        <div className="gradient-orb orb-c" />
        <div className="bubble-layer">
          {bubbles.map((bubble) => {
            const bubbleX = (bubble.x / 100) * heroSize.width;
            const bubbleY = (bubble.y / 100) * heroSize.height;
            const dx = bubbleX - cursor.x;
            const dy = bubbleY - cursor.y;
            const distance = Math.hypot(dx, dy);
            const isNear = distance < 170;
            const force = isNear ? (170 - distance) / 170 : 0;
            const safeDistance = distance || 1;
            const pushX = (dx / safeDistance) * force * 30;
            const pushY = (dy / safeDistance) * force * 30;

            return (
              <span
                key={bubble.id}
                className="water-bubble"
                style={{
                  left: `${bubble.x}%`,
                  top: `${bubble.y}%`,
                  width: `${bubble.size}px`,
                  height: `${bubble.size}px`,
                  transform: `translate(${pushX}px, ${pushY}px)`
                }}
              />
            );
          })}
        </div>
        <div className="hero-content">
          <h1>Review Manager</h1>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <h2>로그인</h2>
          <p>아이디와 패스워드를 입력하세요.</p>

          <label htmlFor="loginId">아이디</label>
          <input
            id="loginId"
            name="loginId"
            type="text"
            placeholder="아이디 입력"
            value={form.loginId}
            onChange={handleChange}
            required
          />

          <label htmlFor="password">패스워드</label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="패스워드 입력"
            value={form.password}
            onChange={handleChange}
            required
          />

          <button type="submit">로그인</button>
          {isLoading && <p className="login-message">로그인 확인 중...</p>}
          {!isLoading && errorMessage && <p className="login-error">{errorMessage}</p>}
        </form>
      </section>
    </main>
  );
}
