// @ts-nocheck

import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ADMIN_STORAGE_KEY } from "@/constants/admin";
import {
  ADMIN_PERMISSION_CODE,
  ADMIN_PERMISSION_EFFECT,
  ADMIN_PERMISSION_SCOPE,
  ADMIN_ROLE
} from "@/constants/adminAccess";
import { useAdminAccessContext } from "@/contexts/AdminAccessContext";
import { fetchAdminMembers, updateAdminMemberPermission } from "@/services/adminMembers";
import { getLocalStorageValue } from "@/utils/browserStorage";
import { hasPermissionWithLegacyFallback, normalizePermissionBinding, resolvePermission } from "@/utils/permissionResolver";

const PERMISSION_OPTIONS = [
  [ADMIN_PERMISSION_CODE.MENU_DASHBOARD, "대시보드 메뉴", "메뉴"],
  [ADMIN_PERMISSION_CODE.MENU_PRODUCT, "상품 메뉴", "메뉴"],
  [ADMIN_PERMISSION_CODE.MENU_REVIEW_RECEIVE, "리뷰받기 메뉴", "메뉴"],
  [ADMIN_PERMISSION_CODE.MENU_PRODUCT_OVERVIEW, "상품전체보기 메뉴", "메뉴"],
  [ADMIN_PERMISSION_CODE.MENU_EXPORT, "내보내기 메뉴", "메뉴"],
  [ADMIN_PERMISSION_CODE.MENU_FILE_UPLOAD, "파일 업로드 메뉴", "메뉴"],
  [ADMIN_PERMISSION_CODE.MENU_BULK_EDIT, "일괄수정 메뉴", "메뉴"],
  [ADMIN_PERMISSION_CODE.PRODUCT_READ, "상품 조회", "상품"],
  [ADMIN_PERMISSION_CODE.PRODUCT_CREATE, "상품 생성", "상품"],
  [ADMIN_PERMISSION_CODE.PRODUCT_UPDATE, "상품 수정", "상품"],
  [ADMIN_PERMISSION_CODE.PRODUCT_DELETE, "상품 삭제", "상품"],
  [ADMIN_PERMISSION_CODE.APPLICATION_READ, "신청자 조회", "신청자"],
  [ADMIN_PERMISSION_CODE.APPLICATION_CREATE, "신청자 생성", "신청자"],
  [ADMIN_PERMISSION_CODE.APPLICATION_UPDATE, "신청자 수정", "신청자"],
  [ADMIN_PERMISSION_CODE.APPLICATION_DELETE, "신청자 삭제", "신청자"],
  [ADMIN_PERMISSION_CODE.APPLICATION_CONFIRM, "신청자 확정", "신청자"],
  [ADMIN_PERMISSION_CODE.SUBMISSION_READ, "제출 조회", "제출"],
  [ADMIN_PERMISSION_CODE.SUBMISSION_CREATE, "제출 생성", "제출"],
  [ADMIN_PERMISSION_CODE.SUBMISSION_UPDATE, "제출 수정", "제출"],
  [ADMIN_PERMISSION_CODE.SUBMISSION_DELETE, "제출 삭제", "제출"],
  [ADMIN_PERMISSION_CODE.DEPOSIT_VERIFY, "입금 확인", "입금"],
  [ADMIN_PERMISSION_CODE.DEPOSITOR_NAME_UPDATE, "예정 입금자명 수정", "입금"],
  [ADMIN_PERMISSION_CODE.PHOTO_READ, "증빙 사진 조회", "사진"],
  [ADMIN_PERMISSION_CODE.PHOTO_UPLOAD, "증빙 사진 업로드", "사진"],
  [ADMIN_PERMISSION_CODE.PHOTO_DELETE, "증빙 사진 삭제", "사진"],
  [ADMIN_PERMISSION_CODE.EXPORT_EXECUTE, "내보내기 실행", "운영"],
  [ADMIN_PERMISSION_CODE.BULK_EDIT_EXECUTE, "일괄수정 실행", "운영"]
].map(([code, label, group]) => ({ code, label, group }));

const EFFECT_OPTIONS = [
  { value: "inherit", label: "상위 기본값 상속" },
  { value: ADMIN_PERMISSION_EFFECT.ALLOW, label: "허용" },
  { value: ADMIN_PERMISSION_EFFECT.DENY, label: "거부" }
];

const DATA_SCOPE_OPTIONS = [
  { value: ADMIN_PERMISSION_SCOPE.PERSONAL, label: "본인" },
  { value: ADMIN_PERMISSION_SCOPE.COMPANY, label: "회사" },
  { value: ADMIN_PERMISSION_SCOPE.ALL, label: "전체" }
];

function getMemberId(member) {
  return member?.loginId ?? member?.login_id ?? "";
}

function getMemberPermissions(member) {
  return Array.isArray(member?.permissions) ? member.permissions : [];
}

function getEffectivePermission(member, code) {
  return resolvePermission(
    code,
    {
      adminId: getMemberId(member),
      companyId: member?.companyId ?? member?.company_id,
      role: member?.role
    },
    getMemberPermissions(member)
  );
}

function getExplicitPermission(member, code) {
  return getMemberPermissions(member)
    .map(normalizePermissionBinding)
    .filter(Boolean)
    .filter((binding) => binding.permissionCode === code && binding.subjectType === "admin")
    .sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))
    .slice(-1)[0] ?? null;
}

function formatRole(role) {
  if (role === ADMIN_ROLE.COMPANY_ADMIN) return "회사 관리자";
  if (role === ADMIN_ROLE.DEVELOPER) return "개발자";
  return "임직원";
}

export default function AdminMemberAccessPage() {
  const adminId = getLocalStorageValue(ADMIN_STORAGE_KEY);
  const navigate = useNavigate();
  const access = useAdminAccessContext();
  const role = access?.role ?? null;
  const companyId = access?.companyId ?? null;
  const permissionBindings = access?.permissionBindings ?? [];
  const principal = { adminId, companyId, role };
  const canReadMembers = hasPermissionWithLegacyFallback(
    ADMIN_PERMISSION_CODE.ADMIN_MEMBER_READ,
    principal,
    permissionBindings,
    false
  );
  const canUpdatePermissions = hasPermissionWithLegacyFallback(
    ADMIN_PERMISSION_CODE.ADMIN_PERMISSION_UPDATE,
    principal,
    permissionBindings,
    false
  );
  const [members, setMembers] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [pending, setPending] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const selectedMember = useMemo(
    () => members.find((member) => getMemberId(member) === selectedMemberId) ?? null,
    [members, selectedMemberId]
  );

  const loadMembers = useCallback(async () => {
    if (!canReadMembers) {
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setSuccessMessage("");
    const result = await fetchAdminMembers();

    if (result.error) {
      setMembers([]);
      setSelectedMemberId("");
      setErrorMessage(result.error.message);
      setIsLoading(false);
      return;
    }

    const nextMembers = result.data ?? [];
    setMembers(nextMembers);
    setSelectedMemberId((current) =>
      nextMembers.some((member) => getMemberId(member) === current) ? current : getMemberId(nextMembers[0])
    );
    setPending({});
    setIsLoading(false);
  }, [canReadMembers]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  if (!adminId) {
    return <Navigate to="/admin/login" replace />;
  }

  if (!role || !canReadMembers) {
    return (
      <section className="dashboard-panel">
        <Card className="p-6">
          <h1 className="text-lg font-semibold">임직원 권한 관리</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            개발자 또는 같은 회사의 회사 관리자만 임직원 권한을 관리할 수 있습니다.
          </p>
          {!role && (
            <p className="mt-2 text-sm text-muted-foreground">
              서버 gateway가 활성화되면 DB 권한과 계층을 확인할 수 있습니다.
            </p>
          )}
          <Button className="mt-4" variant="outline" onClick={() => navigate("/admin/setting")}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> 설정으로 돌아가기
          </Button>
        </Card>
      </section>
    );
  }

  const getDraft = (code) => {
    const key = `${selectedMemberId}:${code}`;
    const explicit = getExplicitPermission(selectedMember, code);
    return (
      pending[key] ?? {
        effect: explicit?.effect ?? "inherit",
        dataScope: explicit?.dataScope ?? ADMIN_PERMISSION_SCOPE.PERSONAL
      }
    );
  };

  const setDraft = (code, field, value) => {
    const key = `${selectedMemberId}:${code}`;
    setPending((previous) => ({
      ...previous,
      [key]: {
        ...getDraft(code),
        [field]: value
      }
    }));
    setSuccessMessage("");
  };

  const handleSave = async () => {
    if (!selectedMember || !canUpdatePermissions) {
      return;
    }

    const changes = Object.entries(pending).filter(([key]) => key.startsWith(`${selectedMemberId}:`));
    if (changes.length === 0) {
      setSuccessMessage("변경된 권한이 없습니다.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    for (const [key, draft] of changes) {
      const permissionCode = key.slice(`${selectedMemberId}:`.length);
      const result = await updateAdminMemberPermission({
        targetAdminId: selectedMemberId,
        permissionCode,
        effect: draft.effect === "inherit" ? null : draft.effect,
        dataScope: draft.dataScope,
        remove: draft.effect === "inherit"
      });

      if (result.error) {
        setErrorMessage(`${permissionCode} 저장 중 오류가 발생했습니다: ${result.error.message}`);
        setIsSaving(false);
        return;
      }
    }

    setIsSaving(false);
    setPending({});
    setSuccessMessage("임직원 권한을 저장했습니다. 대상 계정의 다음 요청부터 적용됩니다.");
    await loadMembers();
  };

  return (
    <section className="dashboard-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">임직원 권한 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {role === ADMIN_ROLE.DEVELOPER ? "전체 회사의 모든 계정" : "현재 회사의 임직원"} 개인 override를 관리합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/admin/setting")}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> 설정
          </Button>
          <Button variant="outline" onClick={loadMembers} disabled={isLoading || isSaving}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> 새로고침
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="max-w-xl">
          <Label htmlFor="member-select">대상 계정</Label>
          <Select value={selectedMemberId} onValueChange={setSelectedMemberId} disabled={isLoading || isSaving}>
            <SelectTrigger id="member-select" className="mt-2">
              <SelectValue placeholder={isLoading ? "불러오는 중..." : "임직원을 선택하세요"} />
            </SelectTrigger>
            <SelectContent>
              {members.map((member) => (
                <SelectItem key={getMemberId(member)} value={getMemberId(member)}>
                  {getMemberId(member)} · {member.username || "이름 없음"} · {member.company || "회사 없음"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedMember && (
            <p className="mt-2 text-xs text-muted-foreground">
              역할: {formatRole(selectedMember.role)} · 상태: {selectedMember.isActive === false ? "비활성" : "활성"}
            </p>
          )}
        </div>
      </Card>

      {errorMessage && <p className="text-sm text-destructive" role="alert">{errorMessage}</p>}
      {successMessage && <p className="text-sm text-emerald-600" role="status">{successMessage}</p>}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>구분</TableHead>
                <TableHead>권한</TableHead>
                <TableHead>현재 적용값</TableHead>
                <TableHead className="w-52">개인 override</TableHead>
                <TableHead className="w-44">데이터 범위</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedMember && PERMISSION_OPTIONS.map((option) => {
                const effective = getEffectivePermission(selectedMember, option.code);
                const draft = getDraft(option.code);

                return (
                  <TableRow key={option.code}>
                    <TableCell className="text-xs text-muted-foreground">{option.group}</TableCell>
                    <TableCell>
                      <p className="font-medium">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.code}</p>
                    </TableCell>
                    <TableCell>
                      <span className={effective.allowed ? "text-emerald-600" : "text-muted-foreground"}>
                        {effective.allowed ? "허용" : "거부"}
                      </span>
                      {effective.source?.subjectType && (
                        <span className="ml-2 text-xs text-muted-foreground">({effective.source.subjectType})</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={draft.effect}
                        onValueChange={(value) => setDraft(option.code, "effect", value)}
                        disabled={!canUpdatePermissions || isSaving}
                      >
                        <SelectTrigger aria-label={`${option.label} 개인 override`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EFFECT_OPTIONS.map((effect) => (
                            <SelectItem key={effect.value} value={effect.value}>{effect.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={draft.dataScope}
                        onValueChange={(value) => setDraft(option.code, "dataScope", value)}
                        disabled={!canUpdatePermissions || isSaving || draft.effect === "inherit"}
                      >
                        <SelectTrigger aria-label={`${option.label} 데이터 범위`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DATA_SCOPE_OPTIONS.map((scope) => (
                            <SelectItem key={scope.value} value={scope.value}>{scope.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!selectedMember && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    관리할 임직원을 선택하세요.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!selectedMember || !canUpdatePermissions || isSaving || Object.keys(pending).length === 0}>
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          {isSaving ? "저장 중..." : "권한 저장"}
        </Button>
      </div>
    </section>
  );
}
