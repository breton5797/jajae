/**
 * lib/client-portal — B2B2C projections + selection logic. Pure; lib/types + utils.
 * Enforces that end clients never see supplier cost / PB margin / internal status by
 * projecting to client-safe shapes (defense-in-depth alongside RLS row scoping).
 */
import type {
  ClientSafeLine,
  ClientSelection,
  ClientSelectionOption,
  ProductUnit,
  ReorderDraftLine,
} from "@/lib/types";
import { type Result, ok, err } from "@/lib/utils";

const PRICING_INTERNAL_KEYS = [
  "cost",
  "margin_rate",
  "marginRate",
  "supplier_id",
  "supplierId",
  "platform_fee",
  "platformFee",
];

/** True if an object exposes any supplier-internal pricing field (test guard). */
export function containsPricingInternals(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const keys = Object.keys(obj as Record<string, unknown>);
  return keys.some((k) => PRICING_INTERNAL_KEYS.includes(k));
}

/** Project a BOM/quote line to a client-safe line (no cost/supplier/margin). */
export function toClientSafeLine(line: {
  category: string;
  item: string;
  qty: number;
  unit: ProductUnit;
  clientPrice: number;
}): ClientSafeLine {
  return {
    item: line.item,
    category: line.category,
    qty: line.qty,
    unit: line.unit,
    clientPrice: line.clientPrice,
  };
}

export function scrubBomForClient(
  lines: Array<{
    category: string;
    item: string;
    qty: number;
    unit: ProductUnit;
    clientPrice: number;
  }>,
): ClientSafeLine[] {
  return lines.map(toClientSafeLine);
}

/** Validate a curated option set carries no pricing internals. */
export function validateOptionSet(
  options: ClientSelectionOption[],
): Result<true> {
  if (options.length === 0) return err("선택 옵션이 비어 있습니다.");
  for (const o of options) {
    if (containsPricingInternals(o)) {
      return err("옵션에 공급가/마진 등 내부 정보가 포함될 수 없습니다.");
    }
    if (!o.productId || !o.label) return err("옵션 정보가 올바르지 않습니다.");
  }
  return ok(true);
}

export interface ClientChoiceResult {
  chosen: string[];
  status: ClientSelection["status"];
}

/** Apply a client's choice. No valid picks → declined. */
export function applyClientChoice(
  selection: Pick<ClientSelection, "option_set">,
  chosenIds: string[],
): ClientChoiceResult {
  const validIds = new Set(selection.option_set.map((o) => o.id));
  const chosen = chosenIds.filter((id) => validIds.has(id));
  return { chosen, status: chosen.length > 0 ? "chosen" : "declined" };
}

/** Convert a client's chosen options into contractor cart lines. */
export function selectionToCartLines(
  selection: Pick<ClientSelection, "option_set" | "chosen">,
  qtyByOptionId: Record<string, number> = {},
): ReorderDraftLine[] {
  const byId = new Map(selection.option_set.map((o) => [o.id, o]));
  return selection.chosen
    .map((id) => byId.get(id))
    .filter((o): o is ClientSelectionOption => Boolean(o))
    .map((o) => ({ productId: o.productId, qty: qtyByOptionId[o.id] ?? 1 }));
}

const KR_PHONE = /^01[0-9]-?\d{3,4}-?\d{4}$/;

/** Validate a phone login (format + simple abuse cap). */
export function validatePhoneLogin(
  phone: string,
  recentAttempts = 0,
): Result<true> {
  if (!KR_PHONE.test(phone.trim())) {
    return err("올바른 휴대폰 번호 형식이 아닙니다.");
  }
  if (recentAttempts >= 5) {
    return err("인증 시도가 너무 많습니다. 잠시 후 다시 시도하세요.");
  }
  return ok(true);
}
