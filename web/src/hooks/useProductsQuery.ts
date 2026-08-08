import { useCallback, useEffect, useState } from "react";
import { api, ProductMeta, ProductStatus, ProductType, PaginatedResponse, Product } from "../api";
import { toast } from "sonner";

interface UseProductsQueryOptions {
  page: number;
  pageSize: number;
  type?: ProductType | "";
  collection?: string;
  status?: ProductStatus | "";
  generatable?: boolean;
}

export function useProductsQuery(options: UseProductsQueryOptions) {
  const { page, pageSize, type, collection, status, generatable } = options;
  const [data, setData] = useState<PaginatedResponse<Product> | null>(null);
  const [meta, setMeta] = useState<ProductMeta | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, m] = await Promise.all([
        api.listProducts({
          type: type || undefined,
          collection: collection || undefined,
          status: status || undefined,
          generatable,
          page,
          page_size: pageSize,
        }),
        api.getProductMeta(),
      ]);
      setData(prods);
      setMeta(m);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, type, collection, status, generatable]);

  useEffect(() => {
    reload().catch(() => undefined);
  }, [reload]);

  return { data, meta, loading, reload, products: data?.items ?? [] };
}
