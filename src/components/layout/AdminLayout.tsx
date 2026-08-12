import { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Download,
  LayoutDashboard,
  LogOut,
  Package,
  PencilLine,
  Settings,
  Table2,
  Upload
} from "lucide-react";
import {
  ADMIN_MENU_NUMBER,
  ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY,
  ADMIN_STORAGE_KEY,
  getAdminMenuItemByNumber,
  getAdminMenuItemByPathname
} from "@/constants/admin";
import { fetchAdminMenuPermissions, logoutAdmin } from "@/services/adminAuth";
import { useAdminCapabilities } from "@/hooks/useAdminCapabilities";
import { AdminAccessContext } from "@/contexts/AdminAccessContext";
import { getLocalStorageValue, setLocalStorageValue } from "@/utils/browserStorage";
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger
} from "@/components/ui/sidebar";

type MenuChild = {
  label: string;
  path: string;
};

type MenuItem = {
  menuNumber: number;
  label: string;
  path: string;
  children?: MenuChild[];
};

type LogoutAlertState = {
  isOpen: boolean;
  isLoading: boolean;
};

const menuIconByNumber: Record<number, LucideIcon> = {
  [ADMIN_MENU_NUMBER.DASHBOARD]: LayoutDashboard,
  [ADMIN_MENU_NUMBER.PRODUCT]: Package,
  [ADMIN_MENU_NUMBER.REVIEW_RECEIVE]: CheckSquare,
  [ADMIN_MENU_NUMBER.PRODUCT_OVERVIEW]: Table2,
  [ADMIN_MENU_NUMBER.EXPORT]: Download,
  [ADMIN_MENU_NUMBER.FILE_UPLOAD]: Upload,
  [ADMIN_MENU_NUMBER.BULK_EDIT]: PencilLine
};

function getExpandableMenuNumbersForPath(pathname: string) {
  const openMenuNumbers: number[] = [];

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
  const adminId = getLocalStorageValue(ADMIN_STORAGE_KEY);

  if (!adminId) {
    return <Navigate to="/admin/login" replace />;
  }

  return <AuthenticatedAdminLayout adminId={adminId} />;
}

function AuthenticatedAdminLayout({ adminId }: { adminId: string }) {
  const {
    capabilities,
    adminProfile,
    isLoadingCapabilities,
    capabilitiesErrorMessage
  } = useAdminCapabilities(adminId);
  const location = useLocation();
  const navigate = useNavigate();
  const [allowedMenus, setAllowedMenus] = useState<MenuItem[]>([]);
  const [isLoadingMenus, setIsLoadingMenus] = useState(true);
  const [menuErrorMessage, setMenuErrorMessage] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => getLocalStorageValue(ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY) === "true"
  );
  const [openMenuNumbers, setOpenMenuNumbers] = useState(() =>
    getExpandableMenuNumbersForPath(location.pathname)
  );
  const [logoutAlert, setLogoutAlert] = useState<LogoutAlertState>({
    isOpen: false,
    isLoading: false
  });

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
        .map((permission: { menu_number: number }) =>
          getAdminMenuItemByNumber(permission.menu_number) as MenuItem | null
        )
        .filter((menuItem): menuItem is MenuItem => Boolean(menuItem));

      setAllowedMenus(nextAllowedMenus);
      setIsLoadingMenus(false);
    };

    loadMenuPermissions();

    return () => {
      isMounted = false;
    };
  }, [adminId]);

  useEffect(() => {
    setLocalStorageValue(ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const nextOpenMenuNumbers = getExpandableMenuNumbersForPath(location.pathname);

    if (nextOpenMenuNumbers.length === 0) {
      return;
    }

    setOpenMenuNumbers((previousMenuNumbers) => {
      const missingMenuNumbers = nextOpenMenuNumbers.filter(
        (menuNumber) => !previousMenuNumbers.includes(menuNumber)
      );

      if (missingMenuNumbers.length === 0) {
        return previousMenuNumbers;
      }

      return [...previousMenuNumbers, ...missingMenuNumbers];
    });
  }, [location.pathname]);

  const currentMenuItem = getAdminMenuItemByPathname(location.pathname) as MenuItem | null;
  const hasCurrentPathPermission = currentMenuItem
    ? allowedMenus.some((menuItem) => menuItem.menuNumber === currentMenuItem.menuNumber)
    : true;
  const fallbackMenuPath = allowedMenus[0]?.path ?? null;

  const toggleMenuGroup = (menuNumber: number) => {
    setOpenMenuNumbers((previousMenuNumbers) =>
      previousMenuNumbers.includes(menuNumber)
        ? previousMenuNumbers.filter((item) => item !== menuNumber)
        : [...previousMenuNumbers, menuNumber]
    );
  };

  const handleLogoutClick = () => {
    setLogoutAlert({ isOpen: true, isLoading: false });
  };

  const handleConfirmLogout = () => {
    setLogoutAlert((previousState) => ({ ...previousState, isLoading: true }));
    logoutAdmin();
    navigate("/admin/login", { replace: true });
  };

  const handleCancelLogout = () => {
    setLogoutAlert({ isOpen: false, isLoading: false });
  };

  const adminAccessValue = useMemo(
    () => ({
      adminId,
      capabilities,
      adminProfile,
      isLoadingCapabilities,
      capabilitiesErrorMessage
    }),
    [adminId, adminProfile, capabilities, capabilitiesErrorMessage, isLoadingCapabilities]
  );

  if (!isLoadingMenus && !menuErrorMessage && !hasCurrentPathPermission && fallbackMenuPath) {
    return <Navigate to={fallbackMenuPath} replace />;
  }

  return (
    <AdminAccessContext.Provider value={adminAccessValue}>
      <SidebarProvider
        open={!isSidebarCollapsed}
        onOpenChange={(open) => setIsSidebarCollapsed(!open)}
        className="min-h-svh bg-background"
      >
        <Sidebar
          collapsible="icon"
          className="border-sidebar-border bg-sidebar"
          aria-label="관리자 메뉴"
        >
          <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
            <div className="flex items-center gap-2">
              <SidebarTrigger
                aria-label={isSidebarCollapsed ? "관리자 메뉴 펼치기" : "관리자 메뉴 접기"}
                title={isSidebarCollapsed ? "관리자 메뉴 펼치기" : "관리자 메뉴 접기"}
              />
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-xs font-semibold text-sidebar-foreground/60">
                  Review Manager
                </p>
                <h2 className="truncate text-sm font-semibold text-sidebar-foreground">
                  관리자 메뉴
                </h2>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>운영 메뉴</SidebarGroupLabel>
              <SidebarGroupContent>
                {isLoadingMenus && (
                  <p className="px-2 text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
                    메뉴 권한을 불러오는 중...
                  </p>
                )}
                {!isLoadingMenus && menuErrorMessage && (
                  <p className="px-2 text-xs text-destructive group-data-[collapsible=icon]:hidden">
                    {menuErrorMessage}
                  </p>
                )}
                {!isLoadingMenus && !menuErrorMessage && allowedMenus.length === 0 && (
                  <p className="px-2 text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
                    표시할 관리자 메뉴 권한이 없습니다.
                  </p>
                )}
                {!isLoadingMenus && !menuErrorMessage && allowedMenus.length > 0 && (
                  <SidebarMenu>
                    {allowedMenus.map((menuItem) => {
                      const isDashboard = menuItem.menuNumber === ADMIN_MENU_NUMBER.DASHBOARD;
                      const isActiveGroup =
                        currentMenuItem?.menuNumber === menuItem.menuNumber;
                      const MenuIcon = menuIconByNumber[menuItem.menuNumber];

                      if (menuItem.children?.length) {
                        const isOpen = openMenuNumbers.includes(menuItem.menuNumber);

                        return (
                          <SidebarMenuItem key={menuItem.menuNumber}>
                            <SidebarMenuButton
                              type="button"
                              isActive={isActiveGroup}
                              onClick={() => toggleMenuGroup(menuItem.menuNumber)}
                              aria-expanded={isOpen}
                              aria-controls={"sidebar-submenu-" + menuItem.menuNumber}
                              title={menuItem.label}
                            >
                              <MenuIcon aria-hidden="true" />
                              <span className="min-w-0 flex-1 truncate">{menuItem.label}</span>
                              {isOpen ? (
                                <ChevronDown aria-hidden="true" />
                              ) : (
                                <ChevronRight aria-hidden="true" />
                              )}
                            </SidebarMenuButton>
                            {isOpen && (
                              <SidebarMenuSub id={"sidebar-submenu-" + menuItem.menuNumber}>
                                {menuItem.children.map((childItem) => (
                                  <SidebarMenuSubItem key={childItem.path}>
                                    <SidebarMenuSubButton asChild>
                                      <NavLink to={childItem.path} end>
                                        <span>{childItem.label}</span>
                                      </NavLink>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                ))}
                              </SidebarMenuSub>
                            )}
                          </SidebarMenuItem>
                        );
                      }

                      return (
                        <SidebarMenuItem key={menuItem.menuNumber}>
                          <SidebarMenuButton
                            asChild
                            isActive={
                              currentMenuItem?.menuNumber === menuItem.menuNumber
                            }
                            title={menuItem.label}
                          >
                            <NavLink to={menuItem.path} end={isDashboard}>
                              <MenuIcon aria-hidden="true" />
                              <span>{menuItem.label}</span>
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                )}
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarSeparator />
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  onClick={() => navigate("/admin/setting")}
                  title="관리자 설정"
                >
                  <Settings aria-hidden="true" />
                  <span>설정</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  onClick={handleLogoutClick}
                  title="로그아웃"
                  className="text-destructive hover:text-destructive"
                >
                  <LogOut aria-hidden="true" />
                  <span>로그아웃</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="min-w-0 bg-transparent">
          <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-2 md:hidden">
            <SidebarTrigger
              aria-label="관리자 메뉴 열기"
              title="관리자 메뉴 열기"
            />
            <span className="text-sm font-semibold text-foreground">Review Manager</span>
          </div>
          <div className="admin-content min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
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
          </div>
        </SidebarInset>

        <AlertDialog
          open={logoutAlert.isOpen}
          onOpenChange={(isOpen) => {
            if (!isOpen && !logoutAlert.isLoading) {
              handleCancelLogout();
            }
          }}
        >
          <AlertDialogContent
            onEscapeKeyDown={(event) => {
              if (logoutAlert.isLoading) {
                event.preventDefault();
              }
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>로그아웃 확인</AlertDialogTitle>
              <AlertDialogDescription>
                정말로 로그아웃 하시겠습니까?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCancelLogout} disabled={logoutAlert.isLoading}>
                취소
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={(event) => {
                  event.preventDefault();
                  if (!logoutAlert.isLoading) {
                    handleConfirmLogout();
                  }
                }}
                disabled={logoutAlert.isLoading}
              >
                {logoutAlert.isLoading ? "로그아웃 중..." : "로그아웃"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarProvider>
    </AdminAccessContext.Provider>
  );
}
