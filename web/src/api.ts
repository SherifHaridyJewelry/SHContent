import type {
  ImportFolderInfo,
  ProductBatchResult,
  ProductImportResult,
  ProductMeta,
} from "./lib/productApiTypes";

export type {
  ProductMeta,
  ImportFolderInfo,
  ProductBatchResult,
  ProductImportResult,
};

export type ImageRole = "anchor" | "detail" | "analysis_only" | "archived";
export type ProductStatus = "draft" | "ready" | "generated";
export type ProductType =
  | "ring"
  | "bracelet"
  | "earrings"
  | "necklace"
  | "half_set"
  | "full_set"
  | "general";

export interface ProductImage {
  filename: string;
  path: string;
  role: ImageRole;
}

export interface Product {
  id: string;
  name: string;
  type: ProductType;
  collection: string | null;
  status: ProductStatus;
  images: ProductImage[];
  last_job_id: string | null;
  last_output: string | null;
  approved_output: string | null;
  review_status: string | null;
}

export interface TemplateSummary {
  name: string;
  template_name: string;
  category: string;
  product_type: string;
  background: string;
  aspect_ratio: string;
  style_ref_count: number;
  scene_ref_count: number;
}

export interface TemplateStyleReferenceResult {
  template: string;
  added: string[];
  skipped: string[];
  style_references: string[];
}

export interface TemplateSceneReferenceResult {
  template: string;
  product_type: string;
  added: string[];
  skipped: string[];
  scene_references: Record<string, string[]>;
}

export type SceneRefProductType =
  | "default"
  | "bracelet"
  | "ring"
  | "earrings"
  | "necklace"
  | "half_set"
  | "full_set"
  | "general";

export type JobStatus =
  | "pending"
  | "uploading"
  | "analyzing"
  | "generating"
  | "success"
  | "failed";

export type ReferenceMode = "none" | "job" | "product";

export interface JobProductResult {
  product_id: string;
  output_name: string;
  run_id: string | null;
  status: JobStatus;
  error: string | null;
  task_id: string | null;
  output_image: string | null;
  output_path: string | null;
  prompt_file: string | null;
  prompt_path: string | null;
  image_url: string | null;
  product_urls: string[];
  output_r2_url: string | null;
  selected_ref_url: string | null;
  resolved_ref_url: string | null;
}

export interface Job {
  id: string;
  status: JobStatus;
  template: string;
  workflow: string | null;
  analyze: boolean;
  category: string;
  output_prefix: string;
  product_ids: string[];
  products: JobProductResult[];
  reference_mode: ReferenceMode;
  selected_ref_url: string | null;
  created_at: string;
  updated_at: string;
  error: string | null;
}

export interface HistoryEntry {
  task_id: string;
  timestamp: string;
  state: string;
  prompt_file: string | null;
  output_file: string | null;
  aspect_ratio: string | null;
  resolution: string | null;
  template: string | null;
  pipeline: boolean | null;
  job_id: string | null;
  image_url: string | null;
  product_urls: string[];
  output_r2_url: string | null;
  review_status: string | null;
  extra: Record<string, unknown>;
}

export interface CatalogItem {
  id: string;
  output_path: string;
  product_id: string | null;
  product_name: string | null;
  product_type: string | null;
  collection: string | null;
  review_status: string | null;
  template: string | null;
  task_id: string | null;
  run_id: string | null;
  job_id: string | null;
  timestamp: string | null;
  source: string;
  image_url: string | null;
  product_urls: string[];
  output_r2_url: string | null;
  prompt_path: string | null;
  is_scene_plate: boolean;
  is_canonical: boolean;
  output_label: string | null;
  anchor_path: string | null;
}

export interface CatalogListResponse extends PaginatedResponse<CatalogItem> {
  meta: CatalogMeta;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface CatalogMeta {
  collections: string[];
  product_types: string[];
  total: number;
  scene_plate_count: number;
  canonical_count: number;
  counts_by_review: Record<string, number>;
}

export interface ScenePlateInfo {
  id: string;
  label: string;
  scene_key: string;
  output_path: string;
  registered: boolean;
  registered_url: string | null;
}

export interface CatalogReviewResult {
  output_path: string;
  status: string | null;
  reviewed_at: string | null;
  product_id: string | null;
  is_canonical: boolean;
  product: Product | null;
}

export type ReviewStatus = "approved" | "rejected" | "pending";

export type CatalogExportScope = "selected" | "current_filter" | "all_catalog";
export type CatalogExportStatus = "pending" | "running" | "success" | "failed";

export interface CatalogExportFilters {
  collection?: string | null;
  product_type?: string | null;
  review_status?: string | null;
  sort?: string;
  scene_plates_only?: boolean;
}

export interface CatalogExportCounts {
  total: number;
  exported: number;
  remote_fetched: number;
  skipped: number;
  failed: number;
}

export interface CatalogExportJob {
  id: string;
  status: CatalogExportStatus;
  scope: CatalogExportScope;
  filters: CatalogExportFilters | null;
  output_paths: string[];
  counts: CatalogExportCounts;
  zip_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScenePlateJob {
  id: string;
  template: string;
  status: string;
  plates: Array<{
    id: string;
    status: string;
    output_path?: string;
    output_r2_url?: string;
    error?: string;
  }>;
  created_at: string;
  updated_at: string;
  error: string | null;
}

const TERMINAL_JOB_STATUSES: JobStatus[] = ["success", "failed"];
const ACTIVE_JOB_STATUSES: JobStatus[] = [
  "pending",
  "uploading",
  "analyzing",
  "generating",
];

export function isJobActive(job: Job | { status: JobStatus }): boolean {
  return ACTIVE_JOB_STATUSES.includes(job.status);
}

export function normalizeAssetPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (
    normalized.startsWith("images/") ||
    normalized.startsWith("raw/") ||
    normalized.startsWith("prompts/")
  ) {
    return normalized;
  }
  const idx = normalized.indexOf("images/jewelry/");
  if (idx >= 0) return normalized.slice(idx);
  const rawIdx = normalized.indexOf("raw/jewelry/");
  if (rawIdx >= 0) return normalized.slice(rawIdx);
  return normalized;
}

const API = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function assetUrl(path: string): string {
  return `${API}/assets/${normalizeAssetPath(path)}`;
}

export function catalogDownloadUrl(outputPath: string): string {
  const q = new URLSearchParams({ output_path: normalizeAssetPath(outputPath) });
  return `${API}/catalog/download?${q}`;
}

export function catalogExportDownloadUrl(exportId: string): string {
  return `${API}/catalog/exports/${encodeURIComponent(exportId)}/download`;
}

export async function downloadCatalogExport(exportId: string): Promise<void> {
  const res = await fetch(catalogExportDownloadUrl(exportId));
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // ignore non-json error bodies
    }
    throw new Error(typeof detail === "string" ? detail : "Export download failed");
  }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
  const filename = match?.[1]
    ? decodeURIComponent(match[1].replace(/"/g, ""))
    : `catalog-export-${exportId}.zip`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function triggerDownload(url: string, filename?: string): void {
  const a = document.createElement("a");
  a.href = url;
  if (filename) a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const api = {
  getProductMeta: () => request<ProductMeta>("/products/meta"),
  listProducts: (params?: {
    collection?: string;
    status?: string;
    type?: string;
    generatable?: boolean;
    page?: number;
    page_size?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.collection) q.set("collection", params.collection);
    if (params?.status) q.set("status", params.status);
    if (params?.type) q.set("type", params.type);
    if (params?.generatable) q.set("generatable", "true");
    if (params?.page) q.set("page", String(params.page));
    if (params?.page_size) q.set("page_size", String(params.page_size));
    const qs = q.toString();
    return request<PaginatedResponse<Product>>(`/products${qs ? `?${qs}` : ""}`);
  },
  getProduct: (id: string) => request<Product>(`/products/${id}`),
  createProduct: (body: {
    id: string;
    name: string;
    type: ProductType;
    collection?: string;
  }) =>
    request<Product>("/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  updateProduct: (id: string, body: Partial<Product>) =>
    request<Product>(`/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  deleteProduct: (id: string) =>
    request<void>(`/products/${id}`, { method: "DELETE" }),
  uploadImage: (id: string, file: File, role: ImageRole) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("role", role);
    return request<Product>(`/products/${id}/images`, { method: "POST", body: fd });
  },
  updateImageRole: (productId: string, filename: string, role: ImageRole) =>
    request<Product>(`/products/${productId}/images/${encodeURIComponent(filename)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    }),
  deleteProductImage: (productId: string, filename: string) =>
    request<Product>(
      `/products/${productId}/images/${encodeURIComponent(filename)}`,
      { method: "DELETE" }
    ),
  batchCreateProducts: (formData: FormData) =>
    request<ProductBatchResult>("/products/batch", { method: "POST", body: formData }),
  scanImportFolders: () => request<ImportFolderInfo[]>("/products/import/scan"),
  importFolders: (body: {
    folder_ids: string[];
    type: ProductType;
    collection?: string;
  }) =>
    request<ProductImportResult>("/products/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  listTemplates: () => request<TemplateSummary[]>("/templates"),
  getTemplate: (name: string) => request<Record<string, unknown>>(`/templates/${name}`),
  addTemplateStyleReferences: (
    name: string,
    body: { output_paths?: string[]; urls?: string[] }
  ) =>
    request<TemplateStyleReferenceResult>(`/templates/${name}/style-references`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  addTemplateSceneReferences: (
    name: string,
    body: {
      product_type: SceneRefProductType;
      output_paths?: string[];
      urls?: string[];
    }
  ) =>
    request<TemplateSceneReferenceResult>(`/templates/${name}/scene-references`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  removeTemplateSceneReference: (
    name: string,
    productType: string,
    url: string
  ) => {
    const q = new URLSearchParams({ product_type: productType, url });
    return request<TemplateSceneReferenceResult>(
      `/templates/${name}/scene-references?${q}`,
      { method: "DELETE" }
    );
  },
  reorderTemplateSceneReference: (
    name: string,
    body: { product_type: string; url: string; direction: "up" | "down" }
  ) =>
    request<TemplateSceneReferenceResult>(`/templates/${name}/scene-references/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  distillSceneRef: (
    name: string,
    body: { output_path: string; scene_key: string }
  ) =>
    request<ScenePlateJob>(`/templates/${name}/scene-plates/distill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  getScenePlateJob: (jobId: string) =>
    request<ScenePlateJob>(`/scene-plate-jobs/${jobId}`),
  listScenePlateJobs: () => request<ScenePlateJob[]>("/scene-plate-jobs"),
  listActiveJobs: () => request<Job[]>("/jobs/active"),
  listActiveScenePlateJobs: () => request<ScenePlateJob[]>("/scene-plate-jobs/active"),
  listJobs: (params?: { page?: number; page_size?: number }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.page_size) q.set("page_size", String(params.page_size));
    const qs = q.toString();
    return request<PaginatedResponse<Job>>(`/jobs${qs ? `?${qs}` : ""}`);
  },
  getJob: (id: string) => request<Job>(`/jobs/${id}`),
  createJob: (body: {
    product_ids: string[];
    template?: string;
    analyze?: boolean;
    output_prefix?: string;
    reference_mode?: ReferenceMode;
    selected_ref_url?: string | null;
    product_refs?: Record<string, string>;
  }) =>
    request<Job>("/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  recoverJob: (jobId: string) =>
    request<{ job_id: string; recovered: unknown[]; still_waiting: unknown[] }>(
      `/jobs/${jobId}/recover`,
      { method: "POST" }
    ),
  resumeJob: (jobId: string) =>
    request<{ job_id: string; action: string; products: number }>(
      `/jobs/${jobId}/resume`,
      { method: "POST" }
    ),
  listHistory: (params?: {
    page?: number;
    page_size?: number;
    state?: string;
    template?: string;
    pipeline_only?: boolean;
  }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.page_size) q.set("page_size", String(params.page_size));
    if (params?.state) q.set("state", params.state);
    if (params?.template) q.set("template", params.template);
    if (params?.pipeline_only) q.set("pipeline_only", "true");
    const qs = q.toString();
    return request<PaginatedResponse<HistoryEntry>>(`/history${qs ? `?${qs}` : ""}`);
  },
  retryHistory: (taskId: string) =>
    request<{ status: string }>(`/history/${taskId}/retry`, { method: "POST" }),
  getCatalogMeta: () => request<CatalogMeta>("/catalog/meta"),
  listCatalog: (params?: {
    page?: number;
    page_size?: number;
    collection?: string;
    product_type?: string;
    review_status?: string;
    sort?: string;
    scene_plates_only?: boolean;
  }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.page_size) q.set("page_size", String(params.page_size));
    if (params?.collection) q.set("collection", params.collection);
    if (params?.product_type) q.set("product_type", params.product_type);
    if (params?.review_status) q.set("review_status", params.review_status);
    if (params?.sort) q.set("sort", params.sort);
    if (params?.scene_plates_only) q.set("scene_plates_only", "true");
    const qs = q.toString();
    return request<CatalogListResponse>(`/catalog${qs ? `?${qs}` : ""}`);
  },
  createCatalogExport: (body: {
    scope: CatalogExportScope;
    output_paths?: string[];
    filters?: CatalogExportFilters;
  }) =>
    request<CatalogExportJob>("/catalog/exports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  getCatalogExport: (exportId: string) =>
    request<CatalogExportJob>(`/catalog/exports/${encodeURIComponent(exportId)}`),
  listCatalogExports: (params?: { page?: number; page_size?: number }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.page_size) q.set("page_size", String(params.page_size));
    const qs = q.toString();
    return request<PaginatedResponse<CatalogExportJob>>(
      `/catalog/exports${qs ? `?${qs}` : ""}`
    );
  },
  setCatalogReview: (body: {
    output_path: string;
    status: ReviewStatus;
    set_canonical?: boolean;
    product_id?: string;
    task_id?: string;
  }) =>
    request<CatalogReviewResult>("/catalog/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  setCanonicalOutput: (body: { product_id: string; output_path: string }) =>
    request<CatalogReviewResult>("/catalog/review/set-canonical", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};

export { TERMINAL_JOB_STATUSES, ACTIVE_JOB_STATUSES };
