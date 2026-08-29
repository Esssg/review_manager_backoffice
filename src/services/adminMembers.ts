// @ts-nocheck

import { isAdminGatewayConfigured, requestAdminGateway } from "@/services/adminGateway";

function gatewayNotConfiguredResult() {
  return {
    data: null,
    error: new Error("임직원 권한 관리 gateway가 아직 활성화되지 않았습니다."),
    isLegacyCompatibility: true
  };
}

/**
 * 개발자/company_admin이 관리할 수 있는 임직원 목록을 gateway 세션 기준으로 읽는다.
 * actor id를 payload로 받지 않는 것이 의도된 계약이다.
 */
export async function fetchAdminMembers() {
  if (!isAdminGatewayConfigured()) {
    return gatewayNotConfiguredResult();
  }

  try {
    const data = await requestAdminGateway("members");
    return {
      data: Array.isArray(data?.members) ? data.members : Array.isArray(data) ? data : [],
      error: null,
      isLegacyCompatibility: false
    };
  } catch (error) {
    return {
      data: [],
      error,
      isLegacyCompatibility: false
    };
  }
}

export async function updateAdminMemberPermission(payload = {}) {
  if (!isAdminGatewayConfigured()) {
    return gatewayNotConfiguredResult();
  }

  try {
    const data = await requestAdminGateway("permissions/update", {
      targetAdminId: payload.targetAdminId,
      permissionCode: payload.permissionCode,
      effect: payload.effect,
      dataScope: payload.dataScope,
      remove: payload.remove === true
    });

    return {
      data,
      error: null,
      isLegacyCompatibility: false
    };
  } catch (error) {
    return {
      data: null,
      error,
      isLegacyCompatibility: false
    };
  }
}
