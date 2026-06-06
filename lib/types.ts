/**
 * Shared domain types. Single source of truth for the whole app.
 * Domain modules (catalog/orders/ai-quote/settlement) import ONLY from here
 * and lib/utils — never from each other.
 */

export type UserRole = "contractor" | "supplier" | "admin";
export type BizStatus = "pending" | "verified" | "rejected";
export type CategoryKind = "interior" | "structural";
export type ProductStatus = "draft" | "pending" | "approved" | "rejected";

export type OrderStatus =
  | "pending"
  | "paid"
  | "partially_fulfilled"
  | "fulfilled"
  | "cancelled";

export type PoStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type PaymentMethod = "escrow" | "credit";
export type PaymentStatus =
  | "pending"
  | "held"
  | "released"
  | "failed"
  | "refunded";

export type DeliveryStatus =
  | "scheduled"
  | "in_transit"
  | "delivered"
  | "delayed";

export type ReturnStatus = "requested" | "approved" | "rejected" | "completed";
export type AsStatus =
  | "requested"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "rejected";
export type SettlementStatus = "pending" | "held" | "released";

/** Selling unit. Drives min-order and shipping grouping (bulk vs piece). */
export type ProductUnit =
  | "ea" // 개
  | "box" // 박스
  | "sheet" // 장 (gypsum, plywood)
  | "roll" // 롤 (wallpaper, waterproof sheet)
  | "can" // 통 (paint)
  | "bag" // 포 (cement)
  | "ton" // 톤 (rebar, sand)
  | "m" // 미터
  | "m2" // 제곱미터 (tile, flooring)
  | "pallet"; // 파렛트 (bulk)

export interface Profile {
  id: string;
  role: UserRole;
  company_name: string;
  biz_no: string | null;
  biz_status: BizStatus;
  credit_limit: number;
  credit_used: number;
  phone: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  owner_id: string;
  name: string;
  biz_no: string;
  status: BizStatus;
  rating: number;
  created_at: string;
}

export interface Category {
  id: string;
  parent_id: string | null;
  kind: CategoryKind;
  name: string;
  slug: string;
  level: number;
  sort: number;
}

/** Category with children attached (tree node). */
export interface CategoryNode extends Category {
  children: CategoryNode[];
}

export interface Product {
  id: string;
  supplier_id: string;
  category_id: string;
  name: string;
  brand: string;
  spec: Record<string, string | number | boolean>;
  unit: ProductUnit;
  unit_price: number;
  stock: number;
  lead_time_days: number;
  spec_sheet_url: string | null;
  status: ProductStatus;
  /** Phase 3: private-label flag + margin metadata (optional; only PB products set these). */
  is_pb?: boolean;
  cost?: number | null;
  margin_rate?: number | null;
  created_at: string;
}

export interface Site {
  id: string;
  contractor_id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  scheduled_date: string | null;
  memo: string | null;
  budget: number;
  start_date: string | null;
  end_date: string | null;
  region: string;
  created_at: string;
}

export interface CartItem {
  id: string;
  contractor_id: string;
  product_id: string;
  qty: number;
  created_at: string;
}

export interface Order {
  id: string;
  contractor_id: string;
  site_id: string | null;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  subtotal: number;
  platform_fee: number;
  total: number;
  toss_payment_key: string | null;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  order_id: string;
  supplier_id: string;
  status: PoStatus;
  subtotal: number;
  platform_fee: number;
  expected_ship_date: string | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  po_id: string;
  product_id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  qty: number;
  line_total: number;
  backordered: boolean;
  created_at: string;
}

export interface Delivery {
  id: string;
  po_id: string;
  site_id: string | null;
  status: DeliveryStatus;
  scheduled_date: string;
  delivered_at: string | null;
  tracking: string | null;
}

export interface ReturnRequest {
  id: string;
  order_item_id: string;
  contractor_id: string;
  reason: string;
  qty: number;
  status: ReturnStatus;
  created_at: string;
}

export interface AsRequest {
  id: string;
  order_item_id: string;
  contractor_id: string;
  site_id: string | null;
  issue: string;
  status: AsStatus;
  scheduled_date: string | null;
  created_at: string;
}

export interface AiQuote {
  id: string;
  contractor_id: string;
  project_type: string;
  area_pyeong: number;
  dimensions: Record<string, number>;
  spec_level: SpecLevel;
  result: BomResult;
  est_total: number;
  created_at: string;
}

export interface Settlement {
  id: string;
  po_id: string;
  supplier_id: string;
  gross: number;
  platform_fee: number;
  net: number;
  status: SettlementStatus;
  released_at: string | null;
}

/* ---------- AI BOM contract ---------- */

export type SpecLevel = "economy" | "standard" | "premium";
export type ProjectType =
  | "apartment_remodel"
  | "bathroom"
  | "kitchen"
  | "commercial_interior"
  | "new_build";

export interface BomInput {
  projectType: ProjectType;
  areaPyeong: number;
  dimensions?: {
    bathroomCount?: number;
    ceilingHeightM?: number;
    wallAreaM2?: number;
  };
  specLevel: SpecLevel;
}

export interface BomLine {
  category: string;
  categorySlug: string;
  item: string;
  qty: number;
  unit: ProductUnit;
  estUnitPrice: number;
  estPrice: number;
  productId?: string;
  supplierId?: string;
  matchedProductName?: string;
}

export interface BomResult {
  lines: BomLine[];
  estTotal: number;
  source: "ai" | "fallback";
  note?: string;
}

/* ---------- Order split contract ---------- */

export interface CartLineInput {
  productId: string;
  qty: number;
}

/** A cart line resolved against current product data. */
export interface ResolvedCartLine {
  product: Product;
  requestedQty: number;
}

/** One per-supplier purchase order produced by the splitter (pre-persistence). */
export interface SplitPurchaseOrder {
  supplierId: string;
  items: SplitOrderItem[];
  subtotal: number;
  platformFee: number;
  maxLeadTimeDays: number;
  expectedShipDate: string;
}

export interface SplitOrderItem {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  fulfilledQty: number;
  backorderedQty: number;
  lineTotal: number;
  backordered: boolean;
  unit: ProductUnit;
  leadTimeDays: number;
}

export interface SplitResult {
  purchaseOrders: SplitPurchaseOrder[];
  subtotal: number;
  platformFee: number;
  total: number;
  hasBackorder: boolean;
}

/** A staged delivery group (items sharing a lead-time window). */
export interface StagedDelivery {
  supplierId: string;
  poIndex: number;
  scheduledDate: string;
  leadTimeDays: number;
  productIds: string[];
  isBackorder: boolean;
}

/* ---------- Phase 2: drawing-based BOM ---------- */

export type RoomType =
  | "living"
  | "room"
  | "bathroom"
  | "kitchen"
  | "balcony"
  | "entrance"
  | "other";

export interface RoomArea {
  name: string;
  type: RoomType;
  areaM2: number;
}

export interface DrawingAnalysisInput {
  /** base64 image (PNG/JPG) for Claude vision */
  imageBase64?: string;
  mimeType?: string;
  /** manual / fallback room list (skips vision) */
  rooms?: RoomArea[];
  specLevel: SpecLevel;
  projectType?: ProjectType;
}

export interface DrawingAnalysisResult {
  rooms: RoomArea[];
  totalAreaM2: number;
  bom: BomResult;
  source: "ai" | "manual";
}

export interface Drawing {
  id: string;
  contractor_id: string;
  site_id: string | null;
  file_path: string;
  file_type: string;
  status: "uploaded" | "analyzed" | "failed";
  rooms: RoomArea[];
  bom: BomResult | Record<string, never>;
  created_at: string;
}

/* ---------- Phase 2: price intelligence ---------- */

export interface PriceComparisonRow {
  productId: string;
  productName: string;
  brand: string;
  supplierId: string;
  unitPrice: number;
  stock: number;
  leadTimeDays: number;
  isLowest: boolean;
  savingsVsMax: number;
}

export interface PriceComparison {
  categoryId: string;
  rows: PriceComparisonRow[];
  min: number;
  max: number;
  median: number;
  count: number;
}

export interface PriceTrendPoint {
  date: string;
  price: number;
}

export interface PriceHistory {
  id: string;
  product_id: string;
  supplier_id: string;
  unit_price: number;
  recorded_at: string;
}

export interface LowestPriceAlert {
  productId: string;
  productName: string;
  paidPrice: number;
  cheaperProductId: string;
  cheaperProductName: string;
  cheaperPrice: number;
  savings: number;
  savingsPct: number;
}

/* ---------- Phase 2: project (현장) workspace ---------- */

export interface SiteDocument {
  id: string;
  site_id: string;
  contractor_id: string;
  name: string;
  file_path: string;
  file_type: string;
  created_at: string;
}

export interface SiteTask {
  id: string;
  site_id: string;
  contractor_id: string;
  title: string;
  phase: string;
  planned_date: string | null;
  done: boolean;
  created_at: string;
}

export interface SiteBudget {
  budget: number;
  spent: number;
  remaining: number;
  burnRatio: number;
  overBudget: boolean;
}

export interface OrderTimelinePoint {
  orderId: string;
  date: string;
  amount: number;
  cumulative: number;
}

export interface ScheduleProgress {
  total: number;
  done: number;
  ratio: number;
  nextTask: SiteTask | null;
}

/* ---------- Phase 3: private label (PB) ---------- */

export interface PbProduct {
  id: string;
  product_id: string;
  sku: string;
  category_id: string;
  cost: number;
  margin_rate: number;
  supplier_id: string;
  created_at: string;
}

export interface PbCandidate {
  categoryId: string;
  categoryName: string;
  totalQty: number;
  orderCount: number;
  avgPrice: number;
  estMarginRate: number;
  score: number;
  rank: number;
}

/** Demand row aggregated from order_items for PB recommendation. */
export interface CategoryDemand {
  categoryId: string;
  categoryName: string;
  totalQty: number;
  orderCount: number;
  avgPrice: number;
}

/* ---------- Phase 3: group buy (공동구매) ---------- */

export interface GroupBuyTier {
  minQty: number;
  unitPrice: number;
}

export type GroupBuyStatus = "open" | "closed" | "cancelled";

export interface GroupBuy {
  id: string;
  product_id: string;
  supplier_id: string;
  title: string;
  start_at: string;
  end_at: string;
  min_qty: number;
  tiers: GroupBuyTier[];
  status: GroupBuyStatus;
  joined_qty: number;
  final_unit_price: number | null;
  created_at: string;
}

export interface GroupBuyJoin {
  id: string;
  group_buy_id: string;
  contractor_id: string;
  qty: number;
  created_at: string;
}

export interface GroupBuyOrderIntent {
  contractorId: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface GroupBuyCloseResult {
  status: "closed" | "cancelled";
  finalUnitPrice: number | null;
  totalQty: number;
  reason?: string;
  orders: GroupBuyOrderIntent[];
}

/* ---------- Phase 3: finance ---------- */

export type SettlementStmtStatus = "draft" | "issued" | "paid" | "disputed";

export interface ContractorSettlement {
  id: string;
  contractor_id: string;
  period: string; // YYYY-MM
  gross: number;
  fee: number;
  net: number;
  status: SettlementStmtStatus;
  created_at: string;
}

export interface MonthlySettlementResult {
  period: string;
  gross: number;
  fee: number;
  net: number;
  orderIds: string[];
}

export type TaxInvoiceStatus = "pending" | "issued" | "failed";

export interface TaxInvoice {
  id: string;
  settlement_id: string;
  provider: string;
  provider_invoice_id: string | null;
  status: TaxInvoiceStatus;
  pdf_url: string | null;
  created_at: string;
}

export interface CreditAccount {
  id: string;
  contractor_id: string;
  limit_amount: number;
  used_amount: number;
  overdue_amount: number;
  due_date: string | null;
  created_at: string;
}

export interface CreditStatus {
  limit: number;
  used: number;
  available: number;
  overdue: number;
  blocked: boolean;
  reason: string | null;
}

/* ---------- Phase 4: logistics ---------- */

export type RunStatus = "planned" | "confirmed" | "dispatched" | "completed";
export type PoTrackStatus = "ready" | "dispatched" | "delivered";

export interface OpenPoForBatching {
  poId: string;
  supplierId: string;
  siteId: string | null;
  region: string;
  date: string;
  lat: number | null;
  lng: number | null;
}

export interface RunStop {
  poId: string;
  siteId: string | null;
  sequence: number;
  lat: number | null;
  lng: number | null;
}

export interface DeliveryRunProposal {
  region: string;
  date: string;
  stops: RunStop[];
  poCount: number;
  singlePo: boolean;
}

export interface DeliveryWindow {
  siteId: string;
  date: string;
  poIds: string[];
  windowLabel: string;
}

export interface DeliveryRun {
  id: string;
  region: string;
  run_date: string;
  route: { stops: RunStop[] } | Record<string, never>;
  status: RunStatus;
  created_at: string;
}

export interface RunPo {
  id: string;
  run_id: string;
  po_id: string;
  sequence: number;
}

/* ---------- Phase 4: supplier ratings ---------- */

export type RatingTier = "최우수" | "우수" | "양호" | "주의" | "신규";

export interface SupplierRatingMetrics {
  deliveredOnTime: number;
  deliveredTotal: number;
  returns: number;
  asCount: number;
  orderCount: number;
  qualityReviews: number[];
}

export interface SupplierRating {
  onTime: number; // 0..1
  returnRate: number; // 0..1
  qualityAvg: number; // 0..5
  composite: number; // 0..5
  orderCount: number;
  reviewCount: number;
  tier: RatingTier;
}

export interface SupplierRatingRow {
  id: string;
  supplier_id: string;
  on_time: number;
  return_rate: number;
  quality_avg: number;
  composite: number;
  order_count: number;
  review_count: number;
  updated_at: string;
}

/* ---------- Phase 4: community ---------- */

export interface Review {
  id: string;
  product_id: string;
  contractor_id: string;
  rating: number;
  body: string;
  photos: string[];
  created_at: string;
}

export interface ReviewAggregate {
  count: number;
  avg: number;
  distribution: number[]; // index 0..4 → ratings 1..5
  summary: string;
  summarySource: "ai" | "fallback";
}

export type CommunityPostType = "thread" | "qna" | "notice";

export interface CommunityPost {
  id: string;
  contractor_id: string;
  type: CommunityPostType;
  title: string;
  body: string;
  created_at: string;
}

export type ReferralStatus = "invited" | "joined" | "rewarded" | "void";

export interface Referral {
  id: string;
  inviter_id: string;
  invitee_id: string | null;
  code: string;
  reward: number;
  status: ReferralStatus;
  created_at: string;
}

/* ---------- Phase 5: demand forecast & auto-reorder ---------- */

export interface PeriodDemand {
  period: string; // YYYY-MM
  qty: number;
}

export type ForecastMethod = "seasonal" | "movingAvg" | "coldStart";

export interface ForecastResult {
  predictedQty: number;
  confidence: number; // 0..1
  method: ForecastMethod;
  coldStart: boolean;
}

export interface Forecast {
  id: string;
  product_id: string;
  period: string;
  predicted_qty: number;
  confidence: number;
  method: string;
  created_at: string;
}

export interface ReorderRule {
  id: string;
  contractor_id: string;
  product_id: string;
  threshold: number; // safety stock (units)
  lead_time_days: number;
  enabled: boolean;
  created_at: string;
}

export interface ReorderSuggestion {
  productId: string;
  currentStock: number;
  reorderPoint: number;
  needsReorder: boolean;
  suggestedQty: number;
}

export interface ReorderDraftLine {
  productId: string;
  qty: number;
}

/* ---------- Phase 5: B2B2C client portal ---------- */

export interface ClientUser {
  id: string;
  phone: string;
  kakao_id: string | null;
  name: string;
  created_at: string;
}

export type ProjectClientRole = "viewer" | "selector";

export interface ProjectClient {
  id: string;
  site_id: string;
  client_user_id: string;
  role: ProjectClientRole;
  created_at: string;
}

/** Client-safe material option (NO supplier cost / PB margin). */
export interface ClientSelectionOption {
  id: string;
  productId: string;
  label: string;
  unitPrice: number;
  imageUrl?: string;
  note?: string;
}

export type ClientSelectionStatus = "open" | "chosen" | "declined";

export interface ClientSelection {
  id: string;
  site_id: string;
  title: string;
  option_set: ClientSelectionOption[];
  chosen: string[]; // chosen option ids
  status: ClientSelectionStatus;
  created_at: string;
}

/** Client-safe BOM/quote line (no cost, supplier, or margin). */
export interface ClientSafeLine {
  item: string;
  category: string;
  qty: number;
  unit: ProductUnit;
  clientPrice: number;
}

/* ---------- Phase 5: owner analytics ---------- */

export interface AnalyticsSnapshot {
  id: string;
  period: string;
  gmv: number;
  margin: number;
  pb_share: number;
  repeat_rate: number;
  forecast_accuracy: number;
  data: Record<string, unknown>;
  created_at: string;
}

export interface SupplierPerf {
  supplierId: string;
  orders: number;
  value: number;
}

export interface AnalyticsResult {
  period: string;
  gmv: number;
  margin: number;
  pbShare: number;
  repeatRate: number;
  forecastAccuracy: number;
  supplierPerf: SupplierPerf[];
}
