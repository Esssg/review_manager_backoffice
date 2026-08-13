import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError
} from "@supabase/supabase-js";

export const REVIEW_RECEIVE_PHOTO_SYNC_ENDPOINT = "/api/review-receive-photo-sync";

type ReviewReceivePhotoSyncPayload = FormData | Record<string, unknown>;

type InvokeReviewReceivePhotoSyncRequestOptions = {
  action: string;
  payload: ReviewReceivePhotoSyncPayload;
  supabaseKey: string;
  getAccessToken: () => Promise<string | null | undefined>;
  endpoint?: string;
  fetchImpl?: typeof fetch;
};

async function parseFunctionResponse(response: Response) {
  const responseType = (response.headers.get("content-type") ?? "text/plain")
    .split(";")[0]
    .trim();

  if (responseType === "application/json") {
    return response.json();
  }

  if (responseType === "application/octet-stream" || responseType === "application/pdf") {
    return response.blob();
  }

  if (responseType === "text/event-stream") {
    return response;
  }

  if (responseType === "multipart/form-data") {
    return response.formData();
  }

  return response.text();
}

export async function invokeReviewReceivePhotoSyncRequest({
  action,
  payload,
  supabaseKey,
  getAccessToken,
  endpoint = REVIEW_RECEIVE_PHOTO_SYNC_ENDPOINT,
  fetchImpl = globalThis.fetch
}: InvokeReviewReceivePhotoSyncRequestOptions) {
  try {
    const accessToken = (await getAccessToken()) ?? supabaseKey;
    const headers = new Headers({
      apikey: supabaseKey,
      Authorization: `Bearer ${accessToken}`
    });
    const isFormData = typeof FormData !== "undefined" && payload instanceof FormData;
    const body = isFormData ? payload : JSON.stringify({ action, ...payload });

    if (!isFormData) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      body,
      credentials: "omit"
    }).catch((fetchError) => {
      throw new FunctionsFetchError(fetchError);
    });

    if (response.headers.get("x-relay-error") === "true") {
      throw new FunctionsRelayError(response);
    }

    if (!response.ok) {
      throw new FunctionsHttpError(response);
    }

    return {
      data: await parseFunctionResponse(response),
      error: null,
      response
    };
  } catch (error) {
    return {
      data: null,
      error,
      response:
        error instanceof FunctionsHttpError || error instanceof FunctionsRelayError
          ? error.context
          : undefined
    };
  }
}
