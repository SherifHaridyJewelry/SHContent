import type { Product } from "../api";

export interface ProductMeta {
  collections: string[];
  counts_by_type: Record<string, number>;
  counts_by_type_ready: Record<string, number>;
  counts_by_type_generatable: Record<string, number>;
  total: number;
  /** All product IDs — used for import ID suggestions (not just the current page). */
  ids?: string[];
}

export interface ImportFolderInfo {
  folder_id: string;
  image_count: number;
}

export interface ProductBatchSkipped {
  key: string;
  reason: string;
}

export interface ProductBatchResult {
  created: Product[];
  skipped: ProductBatchSkipped[];
  errors: string[];
}

export interface ProductImportResult {
  created: Product[];
  errors: string[];
}
