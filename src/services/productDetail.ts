// @ts-nocheck

import { supabase } from "@/lib/supabase";
import { compareByCreatedAtThenId, fetchAllRows, fetchAllRowsInChunks } from "@/services/paginatedQuery";
import {
  ADMIN_GATEWAY_OPERATION,
  callAdminGatewayOperation,
  getGatewayArray,
  omitClientIdentity
} from "@/services/adminGatewayData";
import { isAdminGatewayConfigured } from "@/services/adminGateway";

const PRODUCT_META_SELECT = "id,title,product_name,description,product_link,manager_id";
const SUBMISSION_LIST_SELECT =
  "id,assign_name,order_number,buyer_name,recipient_name,purchase_account,is_purchase_verified,is_review_verified,created_at";

export async function fetchProductMeta(productId, adminId) {
  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.PRODUCT_DETAIL_META, {
      p_product_id: Number(productId)
    });
    const gatewayData = result.data ?? {};
    const product = gatewayData.product ?? gatewayData.productResult?.data ?? (gatewayData.id ? gatewayData : null);
    const steps = getGatewayArray(gatewayData, ["steps", "productSteps", "product_steps"]);

    return {
      productResult: {
        data: result.error ? null : product,
        error: result.error
      },
      stepsResult: {
        data: result.error ? [] : steps,
        error: result.error
      }
    };
  }

  const [productResult, stepsResult] = await Promise.all([
    supabase
      .from("products")
      .select(PRODUCT_META_SELECT)
      .eq("id", productId)
      .eq("manager_id", adminId)
      .maybeSingle(),
    fetchAllRows(() =>
      supabase.from("product_steps").select("id,step_number").eq("product_id", productId)
    )
  ]);

  return {
    productResult,
    stepsResult
  };
}

export async function fetchApplications(productId) {
  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.PRODUCT_DETAIL_APPLICATIONS, {
      p_product_id: Number(productId)
    });
    const data = getGatewayArray(result.data, ["applications", "rows"]);

    if (data) {
      data.sort((left, right) => compareByCreatedAtThenId(left, right));
    }

    return {
      data: result.error ? null : data,
      error: result.error
    };
  }

  const result = await fetchAllRows(() =>
    supabase
      .from("applications")
      .select("id,applicant_name,is_confirmed,created_at")
      .eq("product_id", productId)
  );

  if (result.data) {
    result.data.sort((left, right) => compareByCreatedAtThenId(left, right));
  }

  return result;
}

export async function fetchSubmissions(productId) {
  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.PRODUCT_DETAIL_SUBMISSIONS, {
      p_product_id: Number(productId)
    });
    const data = getGatewayArray(result.data, ["submissions", "rows"]);

    if (data) {
      data.sort((left, right) => compareByCreatedAtThenId(left, right));
    }

    return {
      data: result.error ? null : data,
      error: result.error
    };
  }

  const result = await fetchAllRows(() =>
    supabase
      .from("submissions")
      .select(SUBMISSION_LIST_SELECT)
      .eq("product_id", productId)
  );

  if (result.data) {
    result.data.sort((left, right) => compareByCreatedAtThenId(left, right));
  }

  return result;
}

export async function fetchEvidencePhotos(submissionIds, photoType) {
  if (submissionIds.length === 0) {
    return { photos: [], photosError: null };
  }

  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.PRODUCT_DETAIL_PHOTOS, {
      p_submission_ids: submissionIds.map(Number).filter(Number.isSafeInteger),
      p_photo_type: photoType
    });

    return {
      photos: result.error ? [] : getGatewayArray(result.data, ["photos", "evidencePhotos", "evidence_photos"]),
      photosError: result.error
    };
  }

  const result = await fetchAllRowsInChunks(submissionIds, (submissionIdChunk) =>
    supabase
      .from("evidence_photos")
      .select("id,submission_id,image_url")
      .eq("photo_type", photoType)
      .in("submission_id", submissionIdChunk)
  );

  return {
    photos: result.data ?? [],
    photosError: result.error
  };
}

export async function updateApplicationConfirmed(applicationId, productId, checked) {
  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.PRODUCT_DETAIL_APPLICATION_CONFIRM, {
      p_application_id: Number(applicationId),
      p_product_id: Number(productId),
      p_checked: Boolean(checked)
    });

    return {
      data: result.data ?? null,
      error: result.error
    };
  }

  return supabase
    .from("applications")
    .update({ is_confirmed: checked })
    .eq("id", applicationId)
    .eq("product_id", productId);
}

export async function updateSubmissionVerified(submissionId, targetColumn, checked) {
  const allowedColumns = new Set(["is_purchase_verified", "is_review_verified", "is_deposit_verified"]);

  if (!allowedColumns.has(targetColumn)) {
    return {
      data: null,
      error: new Error("허용되지 않은 검증 항목입니다.")
    };
  }

  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.PRODUCT_DETAIL_SUBMISSION_VERIFY, {
      p_submission_id: Number(submissionId),
      p_target_column: targetColumn,
      p_checked: Boolean(checked)
    });

    return {
      data: result.data ?? null,
      error: result.error
    };
  }

  return supabase
    .from("submissions")
    .update({ [targetColumn]: checked })
    .eq("id", submissionId);
}

export async function setProductStepEnabled(productId, stepNumber, checked) {
  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.PRODUCT_DETAIL_STEP_SET, {
      p_product_id: Number(productId),
      p_step_number: Number(stepNumber),
      p_checked: Boolean(checked)
    });

    return {
      data: result.data ?? null,
      error: result.error
    };
  }

  if (checked) {
    return supabase
      .from("product_steps")
      .insert({ product_id: Number(productId), step_number: stepNumber });
  }

  return supabase
    .from("product_steps")
    .delete()
    .eq("product_id", productId)
    .eq("step_number", stepNumber);
}

export async function findSubmissionByOrderNumber(productId, orderNumber) {
  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.PRODUCT_DETAIL_SUBMISSION_BY_ORDER, {
      p_product_id: Number(productId),
      p_order_number: orderNumber
    });
    const data = result.data?.submission ?? result.data?.data ?? (result.data?.id ? result.data : null);

    return {
      data: result.error ? null : data,
      error: result.error
    };
  }

  return supabase
    .from("submissions")
    .select("id")
    .eq("product_id", productId)
    .eq("order_number", orderNumber)
    .maybeSingle();
}

export async function createSubmission(payload) {
  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.PRODUCT_DETAIL_SUBMISSION_CREATE, {
      p_payload: omitClientIdentity(payload)
    });
    const data = result.data?.submission ?? result.data?.data ?? result.data;

    return {
      data: result.error ? null : data,
      error: result.error
    };
  }

  return supabase.from("submissions").insert(payload).select(SUBMISSION_LIST_SELECT).single();
}
