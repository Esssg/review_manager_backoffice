import assert from "node:assert/strict";
import test from "node:test";
import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import {
  REVIEW_RECEIVE_PHOTO_SYNC_ENDPOINT,
  invokeReviewReceivePhotoSyncRequest
} from "../src/services/reviewReceivePhotoSyncTransport.ts";

test("사진 동기화 JSON 요청은 same-origin 경로와 Supabase 인증 헤더를 사용한다", async () => {
  let capturedRequest;

  const result = await invokeReviewReceivePhotoSyncRequest({
    action: "rollback",
    payload: { submissionId: 17 },
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

  const headers = new Headers(capturedRequest.init.headers);

  assert.equal(capturedRequest.input, REVIEW_RECEIVE_PHOTO_SYNC_ENDPOINT);
  assert.equal(capturedRequest.init.method, "POST");
  assert.equal(capturedRequest.init.credentials, "omit");
  assert.equal(headers.get("apikey"), "test-anon-key");
  assert.equal(headers.get("authorization"), "Bearer test-session-token");
  assert.equal(headers.get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(capturedRequest.init.body), {
    action: "rollback",
    submissionId: 17
  });
  assert.deepEqual(result.data, { ok: true });
  assert.equal(result.error, null);
});

test("사진 동기화 FormData는 브라우저가 multipart boundary를 지정하도록 그대로 전달한다", async () => {
  const formData = new FormData();
  formData.append("action", "sync");
  let capturedInit;

  const result = await invokeReviewReceivePhotoSyncRequest({
    action: "sync",
    payload: formData,
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
  assert.equal(headers.has("content-type"), false);
  assert.equal(headers.get("authorization"), "Bearer test-anon-key");
  assert.deepEqual(result.data, { photos: [] });
});

test("same-origin 요청의 non-2xx 응답은 기존 FunctionsHttpError 계약을 유지한다", async () => {
  const response = new Response(JSON.stringify({ code: "00013", error: "locked" }), {
    status: 409,
    headers: { "Content-Type": "application/json" }
  });

  const result = await invokeReviewReceivePhotoSyncRequest({
    action: "sync",
    payload: new FormData(),
    supabaseKey: "test-anon-key",
    getAccessToken: async () => null,
    fetchImpl: async () => response
  });

  assert.equal(result.data, null);
  assert.equal(result.error instanceof FunctionsHttpError, true);
  assert.strictEqual(result.response, response);
});

test("same-origin 요청 자체가 실패하면 기존 FunctionsFetchError 계약을 유지한다", async () => {
  const result = await invokeReviewReceivePhotoSyncRequest({
    action: "sync",
    payload: new FormData(),
    supabaseKey: "test-anon-key",
    getAccessToken: async () => null,
    fetchImpl: async () => {
      throw new TypeError("network unavailable");
    }
  });

  assert.equal(result.data, null);
  assert.equal(result.error instanceof FunctionsFetchError, true);
  assert.equal(result.response, undefined);
});
