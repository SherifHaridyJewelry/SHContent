import { useCallback, useEffect, useState } from "react";
import { api, CatalogListResponse } from "../api";
import { toast } from "sonner";

interface UseCatalogQueryOptions {
  page: number;
  pageSize: number;
  collection?: string;
  productType?: string;
  reviewStatus?: string;
  sort?: string;
  scenePlatesOnly?: boolean;
  productId?: string;
  enabled?: boolean;
}

export function useCatalogQuery(options: UseCatalogQueryOptions) {
  const {
    page,
    pageSize,
    collection,
    productType,
    reviewStatus,
    sort = "newest",
    scenePlatesOnly = false,
    enabled = true,
  } = options;

  const [data, setData] = useState<CatalogListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const catalog = await api.listCatalog({
        page,
        page_size: pageSize,
        collection: collection || undefined,
        product_type: productType || undefined,
        review_status: reviewStatus || undefined,
        sort,
        scene_plates_only: scenePlatesOnly,
      });
      setData(catalog);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, collection, productType, reviewStatus, sort, scenePlatesOnly, enabled]);

  useEffect(() => {
    reload().catch(() => undefined);
  }, [reload]);

  return {
    data,
    loading,
    reload,
    items: data?.items ?? [],
    meta: data?.meta ?? null,
  };
}
