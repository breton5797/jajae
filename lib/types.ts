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

/* ---------- Phase 6: Open API ---------- */

export type ApiScope =
  | "products:read"
  | "orders:read"
  | "pos:read"
  | "inventory:write"
  | "settlements:read";

export type ApiClientStatus = "active" | "revoked";

export interface ApiClient {
  id: string;
  partner_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: string[];
  status: ApiClientStatus;
  rate_limit: number;
  created_at: string;
}

export interface ApiKeyPair {
  key: string;
  hash: string;
  prefix: string;
}

export interface ApiLog {
  id: string;
  client_id: string;
  endpoint: string;
  method: string;
  status: number;
  ts: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

export type WebhookEventType =
  | "order.created"
  | "po.fulfilled"
  | "settlement.closed";

export interface Webhook {
  id: string;
  client_id: string;
  event: WebhookEventType;
  url: string;
  secret: string;
  active: boolean;
  created_at: string;
}

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed" | "dead";

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  last_attempt_at: string | null;
  payload: Record<string, unknown>;
}

export interface WebhookEventPayload {
  event: WebhookEventType;
  id: string;
  ts: string;
  data: Record<string, unknown>;
}

/* ---------- Phase 6: ERP sync ---------- */

export type ErpDirection = "inbound" | "outbound";

export interface ErpSync {
  id: string;
  supplier_id: string;
  direction: ErpDirection;
  external_id: string;
  last_sync: string | null;
  status: string;
  version: number;
}

export interface ErpStockUpdate {
  externalId: string;
  productId: string;
  stock: number;
  unitPrice: number;
  version: number;
}

export interface ReconcileResult {
  apply: boolean;
  reason: "applied" | "stale" | "noop";
  next: { stock: number; unit_price: number; version: number } | null;
}

/* ---------- Phase 6: credit scoring ---------- */

export type ScoreGrade = "AAA" | "AA" | "A" | "B" | "C" | "NEW";

export interface ScoreMetrics {
  orderCount: number;
  gmv: number;
  onTimeSettlementRate: number; // 0..1
  returnRate: number; // 0..1
  tenureMonths: number;
}

export interface ScoreFactor {
  key: string;
  label: string;
  value: number;
  contribution: number; // points contributed (NOT the raw weight)
}

export interface ScoreResult {
  score: number; // 0..1000
  grade: ScoreGrade;
  factors: ScoreFactor[];
  coldStart: boolean;
}

export interface CreditScore {
  id: string;
  contractor_id: string;
  score: number;
  grade: string;
  factors: ScoreFactor[];
  updated_at: string;
}

/* ---------- Phase 6: embedded finance ---------- */

export type FinanceRequestType = "early_settlement" | "purchase_financing";
export type FinanceRequestStatus =
  | "requested"
  | "approved"
  | "disbursed"
  | "repaying"
  | "settled"
  | "overdue"
  | "rejected";

export interface FinanceRequest {
  id: string;
  contractor_id: string;
  type: FinanceRequestType;
  amount: number;
  fee: number;
  rate: number;
  status: FinanceRequestStatus;
  due_date: string | null;
  disbursed_at: string | null;
  created_at: string;
}

export interface Repayment {
  id: string;
  finance_request_id: string;
  amount: number;
  paid_at: string;
  source: string;
}

export interface EarlyPayout {
  receivable: number;
  rate: number;
  fee: number;
  advance: number;
}

export interface FinanceOffer {
  eligible: boolean;
  limit: number;
  rate: number;
  reason: string | null;
}

export interface RepaymentNetResult {
  applied: number;
  remainingBalance: number;
  settlementRemainder: number;
  fullyRepaid: boolean;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  contractor_id: string | null;
  action: string;
  amount: number;
  ref_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

/* ---------- Phase 7: autonomous procurement & fulfillment ---------- */

export interface AgentPolicy {
  id: string;
  contractor_id: string;
  spend_cap: number;
  supplier_allowlist: string[];
  max_po: number;
  escalation_threshold: number;
  category_limits: Record<string, number>;
  enabled: boolean;
  created_at: string;
}

export interface PlanItem {
  productId: string;
  supplierId: string;
  qty: number;
  amount: number;
  categoryId?: string;
  rationale: string;
}

export interface AgentPlan {
  items: PlanItem[];
  summary: string;
  source: "ai" | "deterministic";
}

export type PolicyDecision = "auto" | "escalate" | "reject" | "halt";

export interface PolicyEval {
  item: PlanItem;
  decision: PolicyDecision;
  reasons: string[];
}

export interface PolicyEvalResult {
  evals: PolicyEval[];
  autoItems: PlanItem[];
  escalateItems: PlanItem[];
  rejectedItems: PlanItem[];
  totalAuto: number;
  halted: boolean;
}

export type AgentDecisionStatus =
  | "pending"
  | "auto_executed"
  | "escalated"
  | "approved"
  | "rejected";

export interface AgentDecision {
  id: string;
  contractor_id: string;
  input: Record<string, unknown>;
  plan: Record<string, unknown>;
  action: string;
  rationale: string;
  status: AgentDecisionStatus;
  created_at: string;
}

export interface AgentAction {
  id: string;
  decision_id: string;
  po_id: string | null;
  executed_at: string;
  reversible_until: string;
  reversed: boolean;
}

export interface Hub {
  id: string;
  name: string;
  location: string;
  lat: number | null;
  lng: number | null;
  capacity: number;
  created_at: string;
}

export interface HubInventory {
  id: string;
  hub_id: string;
  product_id: string;
  qty: number;
}

export type FulfillmentSource = "hub" | "dropship";

export interface FulfillmentRoute {
  id: string;
  order_id: string;
  source_type: FulfillmentSource;
  hub_id: string | null;
  eta: string;
  status: string;
  created_at: string;
}

export interface RouteDecision {
  source: FulfillmentSource;
  hubId: string | null;
  etaDays: number;
  reason: string;
}

export interface AgentOpsStats {
  autoPoCount: number;
  autoPoValue: number;
  escalations: number;
  escalationRate: number;
  interventions: number;
}

/* ---------- Phase 8: return triage ---------- */

export type TriageResponsibility =
  | "supplier"
  | "delivery"
  | "contractor"
  | "ambiguous";

/** 분류기가 제안하는 처리(자동 적용은 'approve'만 후보). */
export type TriageProposedDecision = "approve" | "reject" | "ambiguous";

export interface ReturnClassification {
  responsibility: TriageResponsibility;
  decision: TriageProposedDecision;
  confidence: number; // 0~1
  rationale: string;
}

export interface TriagePolicy {
  id: string;
  auto_approve_cap: number;
  min_confidence: number;
  enabled: boolean;
  created_at: string;
}

/** 트리아지 최종 산출: 자동 승인 또는 사람 에스컬레이션. */
export type TriageOutcome = "auto_approve" | "escalate";

export interface TriageEval {
  outcome: TriageOutcome;
  reasons: string[];
}

/* ---------- Phase 8-2: AS triage ---------- */

export interface AsTriagePolicy {
  id: string;
  min_confidence: number;
  enabled: boolean;
  created_at: string;
}

export type AsTriageOutcome = "auto_schedule" | "escalate";

export interface AsTriageEval {
  outcome: AsTriageOutcome;
  reasons: string[];
}

/* ---------- 인테리어 견적서 (Interior Estimate) ---------- */

export interface EstimateRoom {
  name: string;
  type: RoomType;     // 기존 RoomType 재사용
  widthM: number;     // 평면도 배치용 (없으면 area에서 정사각 근사)
  lengthM: number;
}

export interface EstimateBrief {
  projectType: ProjectType;
  specLevel: SpecLevel;
  rooms: EstimateRoom[];
  budgetKRW?: number;
  materialPrefs?: string[];   // 자유 텍스트 선호 ("화이트 톤 타일" 등)
  notes?: string;
}

export interface FloorPlanRoom {
  name: string;
  type: RoomType;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FloorPlan {
  rooms: FloorPlanRoom[];
  widthM: number;
  lengthM: number;
}

export interface InteriorEstimate {
  id: string;
  contractorId: string;
  customerName?: string;
  transcript: string;
  brief: EstimateBrief;
  floorPlan: FloorPlan;
  bom: BomResult;
  totalKRW: number;
  status: "draft" | "shared";
  createdAt: string;
}
