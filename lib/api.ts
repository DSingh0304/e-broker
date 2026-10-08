export interface Detection {
  id: string;
  className: string;
  confidence: number;
  bbox: { x1: number; y1: number; x2: number; y2: number };
  pricing?: { minINR: number; maxINR: number; unit: string };
  toxicity?: { level: "safe" | "caution" | "hazardous"; notes: string };
}

export interface DetectResponse {
  imageId: string;
  detections: Detection[];
  totalValueRange: { min: number; max: number } | null;
  recyclers: Recycler[];
  passportUrl?: string | null;
  passportId?: string | null;
  agentStreamUrl: string;
  confidenceThreshold?: number | null;
  hiddenGuesses?: number;
}

export interface AgentPricing {
  min_inr: number;
  max_inr: number;
  unit: string;
}

export interface AgentRecycler {
  name: string;
  city?: string;
  distance_km: number;
  phone?: string | null;
  accepts?: string[];
}

export interface AgentResult {
  summary: string;
  pricing: Record<string, AgentPricing>;
  toxicity: Record<string, { level: "safe" | "caution" | "hazardous"; safe_handling: string }>;
  regulations?: Record<string, { rules: string[]; penalty: string }>;
  total_value_range: { min_inr: number; max_inr: number };
  recyclers: AgentRecycler[];
  epr_passport: { passport_id: string; compliance_status: string; compliance_text?: string };
  exchange_rate?: { usd_to_inr: number };
  agent_notes?: string;
}

export interface AgentPollResponse {
  status: "pending" | "streaming" | "done" | "partial" | "error";
  result: AgentResult | null;
  error_detail: string | null;
  duration_ms: number | null;
  completed_at?: string | null;
}

export interface ThinkingStep {
  type: "tool_call" | "tool_result";
  name: string;
  payload: Record<string, unknown>;
}

export interface Recycler {
  name: string;
  address?: string;
  distanceKm: number;
  phone?: string;
}

export interface PublicRecycler {
  name: string;
  city: string;
  state: string;
  address: string;
  lat: number;
  lng: number;
  distance_km: number | null;
  accepts: string[];
  phone: string | null;
  email: string | null;
  website: string | null;
  cpcb_reg_no: string | null;
  cpcb_valid_until: string | null;
  min_quantity_kg: number;
  processing_types: string[];
  verified: boolean;
}

export interface QueueItem {
  imageId: string;
  thumbnailUrl: string;
  detections: { className: string; confidence: number }[];
  reviewStatus: "pending" | "approved" | "corrected" | "skipped";
  uploadedAt: string;
}

export interface LabelPayload {
  className: string;
  bbox: { xc: number; yc: number; w: number; h: number };
}

export interface ModelVersionData {
  id: string;
  version: string;
  s3_key: string;
  map50: number | null;
  map50_95: number | null;
  precision: number | null;
  recall: number | null;
  per_class: Record<string, number>;
  deployed_at: string | null;
  approved_by: string | null;
  canary_traffic_pct: number;
  created_at: string | null;
}

export interface ModelsResponse {
  deployed: ModelVersionData | null;
  candidates: ModelVersionData[];
}

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = process.env.NEXT_PUBLIC_ADMIN_TOKEN || "dev-admin-token";
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function uploadImage(
  file: File
): Promise<{ imageId: string; s3Url: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: form });
  return handle(res);
}

export async function fetchDetections(imageId: string): Promise<DetectResponse> {
  const res = await fetch(`${API_BASE}/api/detect/${imageId}`);
  return handle(res);
}

export async function fetchAgentResult(imageId: string): Promise<AgentPollResponse> {
  const res = await fetch(`${API_BASE}/api/agent/${imageId}/result`);
  return handle(res);
}

export async function scanImageUrl(url: string): Promise<{ imageId: string; s3Url: string }> {
  const res = await fetch(`${API_BASE}/api/scan-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    let detail = `API error: ${res.status}`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* keep default */
    }
    throw new Error(detail);
  }
  return res.json();
}

export interface DemoIdentity {
  phone: string;
  role: "KABADIWALA" | "VENDOR" | "ADMIN" | "RECYCLER";
}

function marketHeaders(identity: DemoIdentity): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-User-Phone": identity.phone,
    "X-User-Role": identity.role,
  };
}

export interface MarketListing {
  id: string;
  seller_id: string;
  seller_name: string | null;
  seller_phone: string | null;
  image_id: string;
  image_url: string | null;
  materials: string[];
  total_weight_kg: number | null;
  asking_price: number | null;
  bid_count: number;
  top_bid: number | null;
  status: string;
  created_at: string | null;
}

export interface MarketBid {
  id: string;
  listing_id: string;
  vendor_id: string;
  vendor_name: string | null;
  asking_price: number | null;
  bid_amount: number;
  status: string;
  created_at: string | null;
}

export async function createListing(
  input: { image_id: string; total_weight_kg: number; asking_price: number },
  identity: DemoIdentity
): Promise<MarketListing> {
  const res = await fetch(`${API_BASE}/api/market/listings`, {
    method: "POST",
    headers: marketHeaders(identity),
    body: JSON.stringify(input),
  });
  return handle(res);
}

export async function fetchMarketListings(): Promise<MarketListing[]> {
  const res = await fetch(`${API_BASE}/api/market/listings`);
  return handle(res);
}

export async function fetchMyListings(identity: DemoIdentity): Promise<MarketListing[]> {
  const res = await fetch(`${API_BASE}/api/market/listings/mine`, {
    headers: { "X-User-Phone": identity.phone, "X-User-Role": identity.role },
  });
  return handle(res);
}

export async function submitBid(
  input: { listing_id: string; bid_amount: number },
  identity: DemoIdentity
): Promise<MarketBid> {
  const res = await fetch(`${API_BASE}/api/market/bids`, {
    method: "POST",
    headers: marketHeaders(identity),
    body: JSON.stringify(input),
  });
  return handle(res);
}

export async function fetchMyBids(identity: DemoIdentity): Promise<MarketBid[]> {
  const res = await fetch(`${API_BASE}/api/market/bids/mine`, {
    headers: { "X-User-Phone": identity.phone, "X-User-Role": identity.role },
  });
  return handle(res);
}

export async function fetchBidInbox(identity: DemoIdentity): Promise<MarketBid[]> {
  const res = await fetch(`${API_BASE}/api/market/bids/inbox`, {
    headers: { "X-User-Phone": identity.phone, "X-User-Role": identity.role },
  });
  return handle(res);
}

export async function acceptBid(
  bidId: string,
  identity: DemoIdentity
): Promise<{ status: string; transaction_started: boolean }> {
  const res = await fetch(`${API_BASE}/api/market/bids/${bidId}/accept`, {
    method: "POST",
    headers: { "X-User-Phone": identity.phone, "X-User-Role": identity.role },
  });
  return handle(res);
}

export interface MarketOverview {
  total_scans: number;
  active_listings: number;
  sold_listings: number;
  bids_received: number;
  total_value_recovered: number;
  top_bid_open: number | null;
}

export async function fetchMarketOverview(identity: DemoIdentity): Promise<MarketOverview> {
  const res = await fetch(`${API_BASE}/api/market/overview`, {
    headers: { "X-User-Phone": identity.phone, "X-User-Role": identity.role },
  });
  return handle(res);
}

export async function fetchRecyclers(params?: {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  accepts?: string;
}): Promise<{ recyclers: PublicRecycler[]; count: number }> {
  const q = new URLSearchParams();
  if (params?.lat !== undefined) q.set("lat", String(params.lat));
  if (params?.lng !== undefined) q.set("lng", String(params.lng));
  if (params?.radiusKm !== undefined) q.set("radius_km", String(params.radiusKm));
  if (params?.accepts) q.set("accepts", params.accepts);
  const qs = q.toString();
  const res = await fetch(`${API_BASE}/api/recyclers${qs ? `?${qs}` : ""}`);
  return handle(res);
}

export async function fetchQueue(params?: {
  page?: number;
  sort?: string;
  status?: string;
}): Promise<{ items: QueueItem[]; total: number }> {
  const q = new URLSearchParams({
    page: String(params?.page ?? 1),
    sort: params?.sort ?? "confidence_asc",
    status: params?.status ?? "pending",
  });
  const res = await fetch(`${API_BASE}/api/admin/queue?${q}`, { headers: adminHeaders() });
  return handle(res);
}

export async function approveQueueItem(imageId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/admin/queue/${imageId}/approve`, {
    method: "POST",
    headers: adminHeaders(),
  });
  return handle(res);
}

export async function skipQueueItem(imageId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/admin/queue/${imageId}/skip`, {
    method: "POST",
    headers: adminHeaders(),
  });
  return handle(res);
}

export async function saveLabels(
  imageId: string,
  labels: LabelPayload[]
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/admin/labels/${imageId}`, {
    method: "POST",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ labels }),
  });
  return handle(res);
}

export async function triggerTraining(): Promise<{ runId: string; modalRunId: string }> {
  const res = await fetch(`${API_BASE}/api/admin/training/trigger`, { method: "POST", headers: adminHeaders() });
  return handle(res);
}

export async function fetchModels(): Promise<ModelsResponse> {
  const res = await fetch(`${API_BASE}/api/admin/models`, { headers: adminHeaders() });
  return handle(res);
}

export async function deployModel(versionId: string): Promise<{ success: boolean; deployedAt: string }> {
  const res = await fetch(`${API_BASE}/api/admin/models/${versionId}/deploy`, {
    method: "POST",
    headers: adminHeaders(),
  });
  return handle(res);
}

export async function rejectModel(versionId: string): Promise<{ success: boolean; status: string }> {
  const res = await fetch(`${API_BASE}/api/admin/models/${versionId}/reject`, {
    method: "POST",
    headers: adminHeaders(),
  });
  return handle(res);
}

export async function getAdminStats(): Promise<any> {
  const res = await fetch(`${API_BASE}/api/admin/stats`, { headers: adminHeaders() });
  return handle(res);
}

export interface TrainingRunRow {
  id: string;
  status: string;
  epochs: number;
  dataset_images: number | null;
  triggered_at: string | null;
  completed_at: string | null;
  map50: number | null;
}

export async function fetchTrainingRuns(limit = 10): Promise<{ runs: TrainingRunRow[] }> {
  const res = await fetch(`${API_BASE}/api/admin/training/runs?limit=${limit}`, {
    headers: adminHeaders(),
  });
  return handle(res);
}

export function adminSseToken(): string {
  return process.env.NEXT_PUBLIC_ADMIN_TOKEN || "dev-admin-token";
}
