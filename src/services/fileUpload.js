import { supabase } from "../lib/supabase";

const FILE_UPLOAD_PRODUCT_SELECT =
  "id,manager_id,title,product_name,deposit_date,company_name,option_name,review_type,planned_depositor_name,is_real_shipping,created_at";
const FILE_UPLOAD_SUBMISSION_SELECT =
  "id,product_id,order_number,buyer_name,recipient_name,purchase_account,contact,address,bank_name,bank_account,account_holder,amount,review_fee,assign_name,is_purchase_verified,is_review_verified,is_deposit_verified,deposited_at,actual_depositor_name,created_at";

function buildUploadIssue({ sourceRowNumber = null, code, message, orderNumber = null, productTitle = null }) {
  return {
    rowNumber: sourceRowNumber,
    column: "",
    code,
    message: [productTitle, orderNumber, message].filter(Boolean).join(" / ")
  };
}

function normalizeProductPayload(payload) {
  return {
    manager_id: payload.manager_id,
    title: payload.title,
    product_name: payload.product_name,
    deposit_date: payload.deposit_date,
    description: payload.description ?? null,
    is_real_shipping: Boolean(payload.is_real_shipping),
    company_name: payload.company_name,
    option_name: payload.option_name,
    review_type: payload.review_type,
    planned_depositor_name: payload.planned_depositor_name
  };
}

function normalizeSubmissionPayload(payload, productId) {
  return {
    product_id: productId,
    order_number: payload.order_number,
    buyer_name: payload.buyer_name,
    recipient_name: payload.recipient_name,
    purchase_account: payload.purchase_account,
    contact: payload.contact,
    address: payload.address,
    bank_name: payload.bank_name,
    bank_account: payload.bank_account,
    account_holder: payload.account_holder,
    amount: payload.amount,
    review_fee: payload.review_fee,
    assign_name: payload.assign_name,
    is_review_verified: Boolean(payload.is_review_verified),
    is_deposit_verified: Boolean(payload.is_deposit_verified),
    deposited_at: payload.deposited_at,
    actual_depositor_name: payload.actual_depositor_name
  };
}

async function createUploadProduct(product) {
  return supabase
    .from("products")
    .insert(normalizeProductPayload(product.payload))
    .select(FILE_UPLOAD_PRODUCT_SELECT)
    .single();
}

async function findSubmissionByOrderNumber(orderNumber) {
  if (!orderNumber) {
    return {
      data: null,
      error: null
    };
  }

  return supabase
    .from("submissions")
    .select("id,order_number")
    .eq("order_number", orderNumber)
    .maybeSingle();
}

async function saveUploadSubmission(submission, productId) {
  const payload = normalizeSubmissionPayload(submission.payload, productId);
  const existingSubmissionResult = await findSubmissionByOrderNumber(payload.order_number);

  if (existingSubmissionResult.error) {
    return {
      action: "failed",
      data: null,
      error: existingSubmissionResult.error
    };
  }

  if (existingSubmissionResult.data?.id) {
    const updateResult = await supabase
      .from("submissions")
      .update(payload)
      .eq("id", existingSubmissionResult.data.id)
      .select(FILE_UPLOAD_SUBMISSION_SELECT)
      .single();

    return {
      action: "updated",
      ...updateResult
    };
  }

  const insertResult = await supabase
    .from("submissions")
    .insert(payload)
    .select(FILE_UPLOAD_SUBMISSION_SELECT)
    .single();

  return {
    action: "inserted",
    ...insertResult
  };
}

export async function uploadFileUploadData(parseResult) {
  const products = parseResult?.products ?? [];
  const result = {
    createdProducts: [],
    insertedSubmissions: [],
    updatedSubmissions: [],
    errors: []
  };

  for (const product of products) {
    const productResult = await createUploadProduct(product);
    const productTitle = product.payload.title || product.payload.product_name || product.clientProductKey;

    if (productResult.error || !productResult.data) {
      result.errors.push(
        buildUploadIssue({
          code: "PRODUCT_INSERT_FAILED",
          productTitle,
          message: productResult.error?.message ?? "상품을 생성하지 못했습니다."
        })
      );
      continue;
    }

    result.createdProducts.push({
      clientProductKey: product.clientProductKey,
      sourceRowNumbers: product.sourceRowNumbers,
      data: productResult.data
    });

    for (const submission of product.submissions ?? []) {
      const submissionResult = await saveUploadSubmission(submission, productResult.data.id);
      const issueContext = {
        sourceRowNumber: submission.sourceRowNumber,
        productTitle,
        orderNumber: submission.payload.order_number
      };

      if (submissionResult.error || !submissionResult.data) {
        result.errors.push(
          buildUploadIssue({
            ...issueContext,
            code: "SUBMISSION_SAVE_FAILED",
            message: submissionResult.error?.message ?? "제출 데이터를 저장하지 못했습니다."
          })
        );
        continue;
      }

      const savedSubmission = {
        sourceRowNumber: submission.sourceRowNumber,
        clientProductKey: submission.clientProductKey,
        data: submissionResult.data
      };

      if (submissionResult.action === "updated") {
        result.updatedSubmissions.push(savedSubmission);
      } else {
        result.insertedSubmissions.push(savedSubmission);
      }
    }
  }

  return {
    ...result,
    summary: {
      createdProductCount: result.createdProducts.length,
      insertedSubmissionCount: result.insertedSubmissions.length,
      updatedSubmissionCount: result.updatedSubmissions.length,
      errorCount: result.errors.length
    }
  };
}
