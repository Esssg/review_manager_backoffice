import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ADMIN_MENU_NUMBER,
  ADMIN_STORAGE_KEY,
  getAdminMenuItemByPathname,
  getAdminMenuItemByNumber
} from "../../constants/admin";
import { fetchAdminMenuPermissions, logoutAdmin } from "../../services/adminAuth";
import AppAlertDialog from "../common/AppAlertDialog";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "review_manager_admin_sidebar_collapsed";

function getExpandableMenuNumbersForPath(pathname) {
  const openMenuNumbers = [];

  if (pathname.startsWith("/admin/product-overview/")) {
    openMenuNumbers.push(ADMIN_MENU_NUMBER.PRODUCT_OVERVIEW);
  }

  if (pathname.startsWith("/admin/review-receive/")) {
    openMenuNumbers.push(ADMIN_MENU_NUMBER.REVIEW_RECEIVE);
  }

  if (pathname.startsWith("/admin/export/")) {
    openMenuNumbers.push(ADMIN_MENU_NUMBER.EXPORT);
  }

  return openMenuNumbers;
}

export default function AdminLayout() {
  const adminId = localStorage.getItem(ADMIN_STORAGE_KEY);
  const location = useLocation();
  const navigate = useNavigate();
  const [allowedMenus, setAllowedMenus] = useState([]);
  const [isLoadingMenus, setIsLoadingMenus] = useState(true);
  const [menuErrorMessage, setMenuErrorMessage] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  });
  const [openMenuNumbers, setOpenMenuNumbers] = useState(() => getExpandableMenuNumbersForPath(location.pathname));
  const [logoutAlert, setLogoutAlert] = useState({
    isOpen: false,
    isLoading: false
  });

  if (!adminId) {
    return <Navigate to="/admin/login" replace />;
  }

  useEffect(() => {
    let isMounted = true;

    const loadMenuPermissions = async () => {
      setIsLoadingMenus(true);
      setMenuErrorMessage("");

      const { data, error } = await fetchAdminMenuPermissions(adminId);

      if (!isMounted) {
        return;
      }

      if (error) {
        setAllowedMenus([]);
        setMenuErrorMessage(error.message);
        setIsLoadingMenus(false);
        return;
      }

      const nextAllowedMenus = (data ?? [])
        .map((permission) => getAdminMenuItemByNumber(permission.menu_number))
        .filter(Boolean);

      setAllowedMenus(nextAllowedMenus);
      setIsLoadingMenus(false);
    };

    loadMenuPermissions();

    return () => {
      isMounted = false;
    };
  }, [adminId]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const nextOpenMenuNumbers = getExpandableMenuNumbersForPath(location.pathname);

    if (nextOpenMenuNumbers.length === 0) {
      return;
    }

    setOpenMenuNumbers((prev) => {
      const missingMenuNumbers = nextOpenMenuNumbers.filter((menuNumber) => !prev.includes(menuNumber));

      if (missingMenuNumbers.length === 0) {
        return prev;
      }

      return [...prev, ...missingMenuNumbers];
    });
  }, [location.pathname]);

  const currentMenuItem = getAdminMenuItemByPathname(location.pathname);
  const hasCurrentPathPermission = currentMenuItem
    ? allowedMenus.some((menuItem) => menuItem.menuNumber === currentMenuItem.menuNumber)
    : true;
  const fallbackMenuPath = allowedMenus[0]?.path ?? null;
  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };
  const toggleMenuGroup = (menuNumber) => {
    setOpenMenuNumbers((prev) =>
      prev.includes(menuNumber) ? prev.filter((item) => item !== menuNumber) : [...prev, menuNumber]
    );
  };

  const handleLogoutClick = () => {
    setLogoutAlert({ isOpen: true, isLoading: false });
  };

  const handleConfirmLogout = () => {
    setLogoutAlert(prev => ({ ...prev, isLoading: true }));
    logoutAdmin();
    navigate("/admin/login", { replace: true });
  };

  const handleCancelLogout = () => {
    setLogoutAlert({ isOpen: false, isLoading: false });
  };

  if (!isLoadingMenus && !menuErrorMessage && !hasCurrentPathPermission && fallbackMenuPath) {
    return <Navigate to={fallbackMenuPath} replace />;
  }

  return (
    <main className={`admin-page${isSidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      <aside
        className={`admin-sidebar${isSidebarCollapsed ? " is-collapsed" : ""}`}
        aria-label="관리자 메뉴"
      >
        <div className="admin-sidebar-header">
          {!isSidebarCollapsed && <h2>관리자 메뉴</h2>}
          <button
            type="button"
            className="sidebar-collapse-button"
            onClick={toggleSidebar}
            aria-label={isSidebarCollapsed ? "관리자 메뉴 펼치기" : "관리자 메뉴 접기"}
            aria-expanded={!isSidebarCollapsed}
          >
            <span aria-hidden="true">{isSidebarCollapsed ? ">" : "<"}</span>
          </button>
        </div>
        <nav>
          {isSidebarCollapsed && <p className="sidebar-collapsed-hint">메뉴</p>}
          {isLoadingMenus && <p className="login-message">메뉴 권한을 불러오는 중...</p>}
          {!isLoadingMenus && menuErrorMessage && <p className="login-error">{menuErrorMessage}</p>}
          {!isLoadingMenus && !menuErrorMessage && allowedMenus.length === 0 && (
            <p className="login-message">표시할 관리자 메뉴 권한이 없습니다.</p>
          )}
          {!isSidebarCollapsed &&
            !isLoadingMenus &&
            !menuErrorMessage &&
            allowedMenus.map((menuItem) => {
              const isDashboard = menuItem.menuNumber === ADMIN_MENU_NUMBER.DASHBOARD;
              const isActiveGroup = currentMenuItem?.menuNumber === menuItem.menuNumber;

              if (menuItem.children?.length) {
                const isOpen = openMenuNumbers.includes(menuItem.menuNumber);

                return (
                  <div key={menuItem.menuNumber} className="sidebar-menu-group">
                    <button
                      type="button"
                      className={`sidebar-menu-item sidebar-menu-toggle${isActiveGroup ? " active" : ""}`}
                      onClick={() => toggleMenuGroup(menuItem.menuNumber)}
                      aria-expanded={isOpen}
                      aria-controls={`sidebar-submenu-${menuItem.menuNumber}`}
                    >
                      <span>{menuItem.label}</span>
                      <span className={`sidebar-menu-caret${isOpen ? " is-open" : ""}`} aria-hidden="true">
                        v
                      </span>
                    </button>
                    {isOpen && (
                      <div
                        id={`sidebar-submenu-${menuItem.menuNumber}`}
                        className="sidebar-submenu"
                        aria-label={`${menuItem.label} 하위 메뉴`}
                      >
                        {menuItem.children.map((childItem) => (
                          <NavLink
                            key={childItem.path}
                            to={childItem.path}
                            end
                            className={({ isActive }) => `sidebar-submenu-item${isActive ? " active" : ""}`}
                          >
                            {childItem.label}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <NavLink
                  key={menuItem.menuNumber}
                  to={menuItem.path}
                  end={isDashboard}
                  className={({ isActive }) => `sidebar-menu-item${isActive ? " active" : ""}`}
                >
                  {menuItem.label}
                </NavLink>
              );
            })}
        </nav>

        <div className="admin-sidebar-footer">
          <button
            type="button"
            className="sidebar-footer-button sidebar-settings-button"
            onClick={() => navigate("/admin/setting")}
            aria-label="관리자 설정"
            title="관리자 설정"
          >
            <span className="sidebar-footer-icon" aria-hidden="true">⚙️</span>
            {!isSidebarCollapsed && <span className="sidebar-footer-label">설정</span>}
          </button>
          <button
            type="button"
            className="sidebar-footer-button sidebar-logout-button"
            onClick={handleLogoutClick}
            aria-label="로그아웃"
            title="로그아웃"
          >
            <span className="sidebar-footer-icon" aria-hidden="true">🚪</span>
            {!isSidebarCollapsed && <span className="sidebar-footer-label">로그아웃</span>}
          </button>
        </div>
      </aside>

      <section className="admin-content">
        {isLoadingMenus ? (
          <section className="dashboard-panel" aria-label="메뉴 권한 로딩 상태">
            <p className="login-message">메뉴 권한을 확인하는 중...</p>
          </section>
        ) : menuErrorMessage ? (
          <section className="dashboard-panel" aria-label="메뉴 권한 오류">
            <p className="login-error">{menuErrorMessage}</p>
          </section>
        ) : !hasCurrentPathPermission && !fallbackMenuPath ? (
          <section className="dashboard-panel" aria-label="권한 없음 안내">
            <h1>접근 권한 없음</h1>
            <p>이 계정에는 접근 가능한 관리자 메뉴 권한이 없습니다.</p>
          </section>
        ) : (
          <Outlet />
        )}
      </section>

      <AppAlertDialog
        isOpen={logoutAlert.isOpen}
        title="로그아웃 확인"
        message="정말로 로그아웃 하시겠습니까?"
        confirmLabel="로그아웃"
        cancelLabel="취소"
        isLoading={logoutAlert.isLoading}
        onConfirm={handleConfirmLogout}
        onCancel={handleCancelLogout}
        variant="danger"
      />
    </main>
  );
}
