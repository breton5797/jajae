/** Korean display labels + badge variants for domain enums. */
import type {
  AsStatus,
  DeliveryStatus,
  OrderStatus,
  PoStatus,
  ProductStatus,
  ReturnStatus,
  BizStatus,
} from "@/lib/types";

type Variant = "default" | "neutral" | "success" | "warning" | "destructive";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "결제대기",
  paid: "결제완료",
  partially_fulfilled: "부분배송",
  fulfilled: "배송완료",
  cancelled: "취소",
};

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  pending: "접수대기",
  accepted: "주문접수",
  preparing: "상품준비중",
  shipped: "출고완료",
  delivered: "배송완료",
  cancelled: "취소",
};

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  scheduled: "배송예정",
  in_transit: "배송중",
  delivered: "배송완료",
  delayed: "지연",
};

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  requested: "반품요청",
  approved: "승인",
  rejected: "반려",
  completed: "완료",
};

export const AS_STATUS_LABEL: Record<AsStatus, string> = {
  requested: "AS요청",
  scheduled: "방문예정",
  in_progress: "처리중",
  completed: "완료",
  rejected: "반려",
};

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  draft: "임시저장",
  pending: "승인대기",
  approved: "판매중",
  rejected: "반려",
};

export const BIZ_STATUS_LABEL: Record<BizStatus, string> = {
  pending: "인증대기",
  verified: "인증완료",
  rejected: "반려",
};

export const UNIT_LABEL: Record<string, string> = {
  ea: "개",
  box: "박스",
  sheet: "장",
  roll: "롤",
  can: "통",
  bag: "포",
  ton: "톤",
  m: "m",
  m2: "㎡",
  pallet: "파렛트",
};

export function deliveryVariant(s: DeliveryStatus): Variant {
  if (s === "delivered") return "success";
  if (s === "delayed") return "destructive";
  if (s === "in_transit") return "default";
  return "neutral";
}

export function poVariant(s: PoStatus): Variant {
  if (s === "delivered") return "success";
  if (s === "cancelled") return "destructive";
  if (s === "pending") return "neutral";
  return "default";
}
