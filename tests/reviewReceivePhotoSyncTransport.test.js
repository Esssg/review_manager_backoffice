import assert from "node:assert/strict";
import test from "node:test";
import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import {
  REVIEW_RECEIVE_PHOTO_SYNC_ENDPOINT,
  invokeReviewReceivePhotoSyncRequest
} from "../src/services/reviewReceivePhotoSyncTransport.ts";
import {
  classifyReviewReceivePhotoSyncNetworkFailure
} from "../src/services/reviewReceivePhotoSyncNetwork.ts";

const STABLE_NETWORK_CONTEXT = {
  online: true,
  visibilityState: "visible",
  millisecondsSinceForeground: null,
  millisecondsSinceNetworkChange: null,
  pageRestoredFromCache: false,
  effectiveType: ""
};

function parseRequestUrl(input) {
  return new URL(String(input), "https://sinabro.review-manager.online");
}

test("사진 동기화 JSON 요청은 추적 ID가 포함된 same-origin 경로와 인증 헤더를 사용한다", async () => {
  let capturedRequest;

  const result = await invokeReviewReceivePhotoSyncRequest({
    action: "rollback",
    payload: { submissionId: 17 },
    operationId: "op-test-json",
    supabaseKey: "test-anon-key",
    getAccessToken: async () => "test-session-token",
    fetchImpl: async (input, init) => {
      capturedRequest = { input, init };
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  const requestUrl = parseRequestUrl(capturedRequest.input);
  const headers = new Headers(capturedRequest.init.headers);

  assert.equal(requestUrl.pathname, REVIEW_RECEIVE_PHOTO_SYNC_ENDPOINT);
  assert.equal(requestUrl.searchParams.get("oid"), "op-test-json");
  assert.equal(requestUrl.searchParams.get("rid"), "op-test-json.1");
  assert.equal(requestUrl.searchParams.get("attempt"), "1");
  assert.equal(requestUrl.searchParams.get("action"), "rollback");
  assert.equal(capturedRequest.init.method, "POST");
  assert.equal(capturedRequest.init.credentials, "omit");
  assert.equal(headers.get("apikey"), "test-anon-key");
  assert.equal(headers.get("authorization"), "Bearer test-session-token");
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("x-review-operation-id"), "op-test-json");
  assert.equal(headers.get("x-review-request-id"), "op-test-json.1");
  assert.deepEqual(JSON.parse(capturedRequest.init.body), {
    action: "rollback",
    operationId: "op-test-json",
    submissionId: 17
  });
  assert.deepEqual(result.data, { ok: true });
  assert.equal(result.error, null);
  assert.equal(result.operationId, "op-test-json");
  assert.equal(result.attempts, 1);
});

test("사진 동기화 FormData는 operationId를 추가하고 multipart boundary는 브라우저에 맡긴다", async () => {
  const formData = new FormData();
  formData.append("action", "sync");
  let capturedInit;

  const result = await invokeReviewReceivePhotoSyncRequest({
    action: "sync",
    payload: formData,
    operationId: "op-test-form",
    maxAttempts: 1,
    supabaseKey: "test-anon-key",
    getAccessToken: async () => null,
    fetchImpl: async (_input, init) => {
      capturedInit = init;
      return new Response(JSON.stringify({ photos: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }
  });

  const headers = new Headers(capturedInit.headers);

  assert.strictEqual(capturedInit.body, formData);
  assert.equal(formData.get("operationId"), "op-test-form");
  assert.equal(headers.has("content-type"), false);
  assert.equal(headers.get("authorization"), "Bearer test-anon-key");
  assert.deepEqual(result.data, { photos: [] });
});

test("same-origin 요청의 non-2xx 응답은 응답과 FunctionsHttpError 계약을 유지한다", async () => {
  const response = new Response(JSON.stringify({ code: "00013", error: "locked" }), {
    status: 409,
    headers: { "Content-Type": "application/json" }
  });

  const result = await invokeReviewReceivePhotoSyncRequest({
    action: "sync",
    payload: new FormData(),
    operationId: "op-test-http",
    maxAttempts: 1,
    supabaseKey: "test-anon-key",
    getAccessToken: async () => null,
    fetchImpl: async () => response
  });

  assert.equal(result.data, null);
  assert.equal(result.error instanceof FunctionsHttpError, true);
  assert.strictEqual(result.response, response);
  assert.equal(result.error.requestId, "op-test-http.1");
});

test("첫 업로드 fetch 실패 후 같은 operationId로 한 번 자동 재시도한다", async () => {
  const requests = [];
  const transportStates = [];

  const result = await invokeReviewReceivePhotoSyncRequest({
    action: "sync",
    payload: new FormData(),
    operationId: "op-test-retry",
    supabaseKey: "test-anon-key",
    getAccessToken: async () => null,
    getNetworkContext: () => STABLE_NETWORK_CONTEXT,
    sleepImpl: async () => {},
    onTransportState: (state) => transportStates.push(state),
    fetchImpl: async (input) => {
      requests.push(parseRequestUrl(input));

      if (requests.length === 1) {
        throw new TypeError("Load failed");
      }

      return new Response(JSON.stringify({ photos: ["/rmb-images/retry.jpg"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get("oid"), "op-test-retry");
  assert.equal(requests[0].searchParams.get("attempt"), "1");
  assert.equal(requests[1].searchParams.get("oid"), "op-test-retry");
  assert.equal(requests[1].searchParams.get("attempt"), "2");
  assert.equal(transportStates[0].state, "retrying");
  assert.equal(transportStates[0].code, "00054");
  assert.equal(result.error, null);
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.data, { photos: ["/rmb-images/retry.jpg"] });
});

test("자동 재시도까지 fetch가 실패하면 원본 오류와 시도별 진단 정보를 보존한다", async () => {
  const result = await invokeReviewReceivePhotoSyncRequest({
    action: "sync",
    payload: new FormData(),
    operationId: "op-test-failure",
    supabaseKey: "test-anon-key",
    getAccessToken: async () => null,
    getNetworkContext: () => STABLE_NETWORK_CONTEXT,
    sleepImpl: async () => {},
    fetchImpl: async () => {
      throw new TypeError("network unavailable");
    }
  });

  assert.equal(result.data, null);
  assert.equal(result.error instanceof FunctionsFetchError, true);
  assert.equal(result.error.transportCode, "00054");
  assert.equal(result.error.transportKind, "fetch-rejected");
  assert.equal(result.error.originalErrorName, "TypeError");
  assert.equal(result.error.originalMessage, "network unavailable");
  assert.equal(result.error.operationId, "op-test-failure");
  assert.equal(result.error.traceId, "op-test-");
  assert.equal(result.error.requestId, "op-test-failure.2");
  assert.equal(result.error.retryCount, 1);
  assert.equal(result.error.attemptFailures.length, 2);
  assert.equal(result.response, undefined);
});

test("오프라인 상태가 계속되면 파일 POST를 시작하지 않고 00050으로 중단한다", async () => {
  let fetchCount = 0;
  const offlineContext = {
    ...STABLE_NETWORK_CONTEXT,
    online: false
  };

  const result = await invokeReviewReceivePhotoSyncRequest({
    action: "sync",
    payload: new FormData(),
    operationId: "op-test-offline",
    supabaseKey: "test-anon-key",
    getAccessToken: async () => null,
    getNetworkContext: () => offlineContext,
    sleepImpl: async () => {},
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response("ok");
    }
  });

  assert.equal(fetchCount, 0);
  assert.equal(result.error instanceof FunctionsFetchError, true);
  assert.equal(result.error.transportCode, "00050");
  assert.equal(result.attempts, 0);
});

test("백그라운드 복귀 직후에는 health 확인 후 업로드를 시작한다", async () => {
  const requestActions = [];
  const recentContext = {
    ...STABLE_NETWORK_CONTEXT,
    millisecondsSinceForeground: 100
  };

  const result = await invokeReviewReceivePhotoSyncRequest({
    action: "sync",
    payload: new FormData(),
    operationId: "op-test-resume",
    maxAttempts: 1,
    supabaseKey: "test-anon-key",
    getAccessToken: async () => null,
    getNetworkContext: () => recentContext,
    sleepImpl: async () => {},
    fetchImpl: async (input) => {
      const requestUrl = parseRequestUrl(input);
      requestActions.push(requestUrl.searchParams.get("action"));

      if (requestUrl.searchParams.get("action") === "health") {
        return new Response("ok", { status: 200 });
      }

      return new Response(JSON.stringify({ photos: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  assert.deepEqual(requestActions, ["health", "sync"]);
  assert.equal(result.error, null);
});

test("브라우저 원본 오류와 생명주기 신호를 분리해 코드화한다", () => {
  assert.deepEqual(
    classifyReviewReceivePhotoSyncNetworkFailure(new TypeError("Load failed"), {
      ...STABLE_NETWORK_CONTEXT,
      millisecondsSinceForeground: 250
    }),
    { code: "00051", kind: "network-transition" }
  );
  assert.deepEqual(
    classifyReviewReceivePhotoSyncNetworkFailure(new DOMException("aborted", "AbortError"), STABLE_NETWORK_CONTEXT),
    { code: "00053", kind: "aborted" }
  );
  assert.deepEqual(
    classifyReviewReceivePhotoSyncNetworkFailure(new DOMException("aborted", "AbortError"), STABLE_NETWORK_CONTEXT, {
      timedOut: true
    }),
    { code: "00052", kind: "timeout" }
  );
});

test("timeout은 장시간 중복 대기를 막기 위해 자동 재시도하지 않는다", async () => {
  let fetchCount = 0;

  const result = await invokeReviewReceivePhotoSyncRequest({
    action: "sync",
    payload: new FormData(),
    operationId: "op-test-timeout",
    requestTimeoutMs: 1,
    supabaseKey: "test-anon-key",
    getAccessToken: async () => null,
    getNetworkContext: () => STABLE_NETWORK_CONTEXT,
    sleepImpl: async () => {},
    fetchImpl: async (_input, init) => {
      fetchCount += 1;
      return await new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("timed out", "AbortError")));
      });
    }
  });

  assert.equal(fetchCount, 1);
  assert.equal(result.error.transportCode, "00052");
  assert.equal(result.attempts, 1);
});
