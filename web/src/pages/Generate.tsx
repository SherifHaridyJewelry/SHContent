import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  assetUrl,
  Product,
  ProductMeta,
  TemplateSummary,
} from "../api";
import Pagination from "../components/Pagination";
import ProductTypeTabs from "../components/ProductTypeTabs";
import SelectionBar from "../components/SelectionBar";
import { typeLabel } from "../lib/productTypes";
import { selectableRowClass } from "../lib/selectionStyles";
import {
  buildSelectableReferences,
  SelectableReference,
} from "../lib/templateRefs";
import { useUrlParams } from "../hooks/useUrlParams";
import { useGenerateStore } from "../stores/generateStore";
import { useJobStore } from "../stores/jobStore";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, AlertCircle, X, ChevronDown, ChevronUp } from "lucide-react";

const DEFAULTS = {
  page: "1",
  page_size: "12",
};

function resolveCollectionFilter(value: string): string | undefined {
  if (!value || value === "all") return undefined;
  return value;
}

export default function Generate() {
  const navigate = useNavigate();
  const { params, setParams } = useUrlParams(DEFAULTS);
  const upsertJob = useJobStore((s) => s.upsertJob);
  const refreshJobs = useJobStore((s) => s.refreshJobs);

  const selectedProductIds = useGenerateStore((s) => s.selectedProductIds);
  const template = useGenerateStore((s) => s.template);
  const analyze = useGenerateStore((s) => s.analyze);
  const typeFilter = useGenerateStore((s) => s.typeFilter);
  const collectionFilter = useGenerateStore((s) => s.collectionFilter);
  const jobRefChoice = useGenerateStore((s) => s.jobRefChoice);
  const jobRefUrl = useGenerateStore((s) => s.jobRefUrl);
  const productRefs = useGenerateStore((s) => s.productRefs);
  const showPerProductRefs = useGenerateStore((s) => s.showPerProductRefs);
  const toggleProduct = useGenerateStore((s) => s.toggleProduct);
  const clearSelection = useGenerateStore((s) => s.clearSelection);
  const removeFromSelection = useGenerateStore((s) => s.removeFromSelection);
  const setSelectedProductIds = useGenerateStore((s) => s.setSelectedProductIds);
  const setTemplate = useGenerateStore((s) => s.setTemplate);
  const setAnalyze = useGenerateStore((s) => s.setAnalyze);
  const setTypeFilter = useGenerateStore((s) => s.setTypeFilter);
  const setCollectionFilter = useGenerateStore((s) => s.setCollectionFilter);
  const setJobRefChoice = useGenerateStore((s) => s.setJobRefChoice);
  const setJobRefUrl = useGenerateStore((s) => s.setJobRefUrl);
  const setProductRef = useGenerateStore((s) => s.setProductRef);
  const setShowPerProductRefs = useGenerateStore((s) => s.setShowPerProductRefs);
  const resetTemplateRefs = useGenerateStore((s) => s.resetTemplateRefs);
  const buildReferencePayload = useGenerateStore((s) => s.buildReferencePayload);

  const selected = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);
  const page = Number(params.page) || 1;
  const pageSize = Number(params.page_size) || 12;

  const [productData, setProductData] = useState<Awaited<ReturnType<typeof api.listProducts>> | null>(null);
  const [meta, setMeta] = useState<ProductMeta | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedProductsCache, setSelectedProductsCache] = useState<Record<string, Product>>({});
  const selectedProductsCacheRef = useRef(selectedProductsCache);
  selectedProductsCacheRef.current = selectedProductsCache;

  const [templateDetail, setTemplateDetail] = useState<Record<string, unknown> | null>(null);
  const [templateDetailLoading, setTemplateDetailLoading] = useState(false);
  const templateDetailCache = useRef<Record<string, Record<string, unknown>>>({});

  const products = productData?.items ?? [];
  const needsTemplateDetail = jobRefChoice === "job" || showPerProductRefs;

  // Load meta + template list once
  useEffect(() => {
    let cancelled = false;
    setBootstrapLoading(true);
    Promise.all([api.getProductMeta(), api.listTemplates()])
      .then(([m, tmpls]) => {
        if (cancelled) return;
        setMeta(m);
        const jewelry = tmpls.filter((t) => t.category === "jewelry");
        const list = jewelry.length > 0 ? jewelry : tmpls;
        setTemplates(list);
        if (list.length > 0 && !list.some((t) => t.name === template)) {
          const preferred = list.find((t) => t.name === "jewelry_catalog_4x5") ?? list[0];
          setTemplate(preferred.name);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setBootstrapLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setTemplate, template]);

  // Load product page when filters change
  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const prods = await api.listProducts({
        generatable: true,
        type: typeFilter || undefined,
        collection: resolveCollectionFilter(collectionFilter),
        page,
        page_size: pageSize,
      });
      setProductData(prods);
      setSelectedProductsCache((prev) => {
        const next = { ...prev };
        for (const p of prods.items) next[p.id] = p;
        return next;
      });
    } catch {
      // keep previous page visible on error
    } finally {
      setProductsLoading(false);
    }
  }, [typeFilter, collectionFilter, page, pageSize]);

  useEffect(() => {
    loadProducts().catch(() => undefined);
  }, [loadProducts]);

  // Lazy-load full template only when reference picker is opened
  useEffect(() => {
    if (!template || !needsTemplateDetail) return;

    const cached = templateDetailCache.current[template];
    if (cached) {
      setTemplateDetail(cached);
      return;
    }

    let cancelled = false;
    setTemplateDetailLoading(true);
    api.getTemplate(template)
      .then((detail) => {
        if (cancelled) return;
        templateDetailCache.current[template] = detail;
        setTemplateDetail(detail);
      })
      .catch(() => {
        if (!cancelled) setTemplateDetail(null);
      })
      .finally(() => {
        if (!cancelled) setTemplateDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [template, needsTemplateDetail]);

  // Fetch labels for selected products not on the current page
  useEffect(() => {
    if (!selectedProductIds.length) return;
    const missing = selectedProductIds.filter((id) => !selectedProductsCacheRef.current[id]);
    if (!missing.length) return;

    let cancelled = false;
    Promise.all(missing.map((id) => api.getProduct(id).catch(() => null)))
      .then((results) => {
        if (cancelled) return;
        setSelectedProductsCache((prev) => {
          const next = { ...prev };
          for (const p of results) {
            if (p) next[p.id] = p;
          }
          return next;
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [selectedProductIds]);

  const selectableRefs = useMemo(
    () => templateDetail ? buildSelectableReferences(templateDetail) : [],
    [templateDetail]
  );

  const selectedTemplate = templates.find((t) => t.name === template);
  const collections = meta?.collections ?? [];
  const generatableCounts = meta?.counts_by_type_generatable ?? {};
  const generatableTotal = Object.values(generatableCounts).reduce((a, b) => a + b, 0);

  const selectedProducts = useMemo(
    () =>
      selectedProductIds
        .map((id) => selectedProductsCache[id] ?? products.find((p) => p.id === id))
        .filter((p): p is Product => !!p),
    [selectedProductIds, selectedProductsCache, products]
  );

  function handleToggleProduct(product: Product) {
    const wasSelected = selected.has(product.id);
    toggleProduct(product.id);
    if (!wasSelected) {
      setSelectedProductsCache((prev) => ({ ...prev, [product.id]: product }));
    }
  }

  function toggleAllOnPage() {
    const pageIds = products.map((p) => p.id);
    const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
    if (allOnPage) {
      removeFromSelection(pageIds);
      return;
    }
    const next = new Set(selected);
    for (const id of pageIds) next.add(id);
    setSelectedProductIds(Array.from(next));
    setSelectedProductsCache((prev) => {
      const updated = { ...prev };
      for (const p of products) updated[p.id] = p;
      return updated;
    });
  }

  const pageProductIds = useMemo(() => products.map((p) => p.id), [products]);
  const allPageSelected =
    pageProductIds.length > 0 && pageProductIds.every((id) => selected.has(id));
  const somePageSelected = pageProductIds.some((id) => selected.has(id));
  const headerCheckboxState: boolean | "indeterminate" = allPageSelected
    ? true
    : somePageSelected
      ? "indeterminate"
      : false;

  function handleTemplateChange(name: string) {
    resetTemplateRefs();
    setTemplate(name);
    setTemplateDetail(templateDetailCache.current[name] ?? null);
  }

  function anchorPath(product: Product): string | null {
    const anchor = product.images.find((i) => i.role === "anchor");
    return anchor?.path ?? product.images[0]?.path ?? null;
  }

  function refThumbnail(ref: SelectableReference): string {
    if (ref.thumbnailPath) return assetUrl(ref.thumbnailPath);
    return ref.url;
  }

  async function startGeneration() {
    if (!selected.size || !template) return;
    setSubmitting(true);
    const ids = Array.from(selected);
    try {
      const refPayload = buildReferencePayload(selected);
      const created = await api.createJob({
        product_ids: ids,
        template,
        analyze,
        ...refPayload,
      });
      upsertJob(created);
      await refreshJobs();
      removeFromSelection(ids);
      toast.success("Generation started");
      navigate(`/tasks/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Job failed to start");
      setSubmitting(false);
    }
  }

  if (bootstrapLoading && !meta) {
    return <Loading variant="skeleton-grid" message="Loading..." />;
  }

  return (
    <div>
      <h2>Generate</h2>
      <p className="text-muted-foreground mb-4">
        Select products, then configure and run the catalog pipeline.
      </p>

      <ProductTypeTabs
        value={typeFilter}
        onChange={(v) => {
          setTypeFilter(v);
          setParams({ page: "1" });
        }}
        counts={generatableCounts}
        total={generatableTotal}
      />

      <div className="card flex gap-4 items-end flex-wrap" style={{ marginTop: "1rem", marginBottom: "1rem" }}>
        <div>
          <label className="text-sm font-medium mb-1 block">Collection</label>
          <Select
            value={collectionFilter || "all"}
            onValueChange={(v) => {
              setCollectionFilter(v === "all" ? "" : v);
              setParams({ page: "1" });
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All collections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All collections</SelectItem>
              {collections.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <SelectionBar
        count={selected.size}
        onClearAll={clearSelection}
        onSelectAllOnPage={toggleAllOnPage}
      >
        {selectedProductIds.map((id) => {
          const p = selectedProductsCache[id];
          return (
            <Badge key={id} variant="secondary" className="gap-1">
              {p?.name ?? id}
              <button
                type="button"
                className="ml-1 inline-flex"
                aria-label={`Remove ${p?.name ?? id}`}
                onClick={() => removeFromSelection([id])}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
      </SelectionBar>

      {/* Product list first — the main interaction */}
      {productsLoading && !productData ? (
        <Loading variant="skeleton-list" message="Loading products..." />
      ) : products.length === 0 && !productsLoading ? (
        <EmptyState
          title="No generatable products"
          description="Add an anchor image on the Products page first, then mark products as ready."
          icon={<AlertCircle className="h-16 w-16" />}
        />
      ) : (
        <>
          {productData && (
            <Pagination
              page={productData.page}
              pageSize={productData.page_size}
              total={productData.total}
              totalPages={productData.total_pages}
              onPageChange={(p) => setParams({ page: String(p) })}
              onPageSizeChange={(s) => setParams({ page: "1", page_size: String(s) })}
              position="top"
            />
          )}
          <div style={{ position: "relative", marginTop: "0.75rem" }}>
            {productsLoading && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(255,255,255,0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1,
                  borderRadius: "var(--radius)",
                }}
              >
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            <table className="card">
              <thead>
                <tr>
                  <th className="w-10">
                    <Checkbox
                      checked={headerCheckboxState}
                      onCheckedChange={toggleAllOnPage}
                      aria-label="Select all on page"
                    />
                  </th>
                  <th></th>
                  <th>Product</th>
                  <th>Type</th>
                  <th>Collection</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const thumb = anchorPath(p);
                  const isRowSelected = selected.has(p.id);
                  return (
                    <tr
                      key={p.id}
                      className={selectableRowClass(isRowSelected, "cursor-pointer")}
                      onClick={() => handleToggleProduct(p)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isRowSelected}
                          onCheckedChange={() => handleToggleProduct(p)}
                          aria-label={`Select ${p.name}`}
                        />
                      </td>
                      <td>
                        {thumb ? (
                          <img
                            src={assetUrl(thumb)}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            style={{
                              width: 48,
                              height: 60,
                              objectFit: "cover",
                              borderRadius: 4,
                              border: "1px solid var(--border-color)",
                            }}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {p.name}
                        <div className="text-muted-foreground text-xs">{p.id}</div>
                      </td>
                      <td>{typeLabel(p.type)}</td>
                      <td>{p.collection ?? "—"}</td>
                      <td>
                        <Badge variant={p.status === "generated" ? "secondary" : "default"}>
                          {p.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {productData && (
            <Pagination
              page={productData.page}
              pageSize={productData.page_size}
              total={productData.total}
              totalPages={productData.total_pages}
              onPageChange={(p) => setParams({ page: String(p) })}
              onPageSizeChange={(s) => setParams({ page: "1", page_size: String(s) })}
              position="bottom"
            />
          )}
        </>
      )}

      {/* Generation settings — collapsed by default */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <button
          type="button"
          className="flex items-center justify-between w-full text-left"
          onClick={() => setShowSettings(!showSettings)}
        >
          <span className="font-medium">
            Generation settings
            {selectedTemplate && (
              <span className="text-muted-foreground font-normal ml-2">
                · {selectedTemplate.template_name}
              </span>
            )}
          </span>
          {showSettings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showSettings && (
          <div style={{ marginTop: "1rem" }}>
            <div className="flex gap-4 items-end flex-wrap">
              <div>
                <label className="text-sm font-medium mb-1 block">Template</label>
                <Select value={template} onValueChange={handleTemplateChange} disabled={templates.length === 0}>
                  <SelectTrigger className="w-[250px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.name} value={t.name}>
                        {t.template_name} ({t.aspect_ratio})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="vision-analysis"
                  checked={analyze}
                  onCheckedChange={(checked) => setAnalyze(checked === true)}
                />
                <Label htmlFor="vision-analysis" className="font-normal cursor-pointer">
                  Vision analysis (Gemini)
                </Label>
              </div>
            </div>
            {selectedTemplate && (
              <p className="text-muted-foreground text-sm mb-4 mt-2">
                {selectedTemplate.background}
              </p>
            )}

            <div className="mb-4">
              <label className="text-sm font-medium mb-1 block">Reference image</label>
              <Select
                value={jobRefChoice}
                onValueChange={(v) => setJobRefChoice(v as "none" | "job")}
              >
                <SelectTrigger className="w-[350px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (product images only)</SelectItem>
                  <SelectItem value="job">Use selected reference for all products</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {jobRefChoice === "job" && (
              <div style={{ marginBottom: "1rem" }}>
                {templateDetailLoading ? (
                  <p className="text-muted-foreground text-sm">Loading references...</p>
                ) : selectableRefs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No style or scene references on this template yet.
                  </p>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                      gap: "0.75rem",
                    }}
                  >
                    {selectableRefs.map((ref) => (
                      <Button
                        key={ref.url}
                        type="button"
                        variant="secondary"
                        className="p-1.5 h-auto flex-col gap-1"
                        style={{
                          border:
                            jobRefUrl === ref.url
                              ? "2px solid var(--accent, #6b8afd)"
                              : "1px solid var(--border-color)",
                        }}
                        onClick={() => setJobRefUrl(ref.url)}
                        aria-label={`Select reference: ${ref.label}`}
                      >
                        <img
                          src={refThumbnail(ref)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          style={{
                            width: "100%",
                            aspectRatio: "4/5",
                            objectFit: "cover",
                            borderRadius: 4,
                            display: "block",
                          }}
                        />
                        <span className="text-xs block mt-1">{ref.label}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {jobRefChoice === "none" && selected.size > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mb-3"
                  onClick={() => setShowPerProductRefs(!showPerProductRefs)}
                >
                  {showPerProductRefs ? "Hide" : "Show"} per-product references
                </Button>
                {showPerProductRefs && (
                  templateDetailLoading ? (
                    <p className="text-muted-foreground text-sm">Loading references...</p>
                  ) : selectableRefs.length > 0 ? (
                    <table style={{ width: "100%", fontSize: "0.85rem" }}>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Type</th>
                          <th>Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedProducts.map((p) => (
                          <tr key={p.id}>
                            <td>{p.name}</td>
                            <td>{typeLabel(p.type)}</td>
                            <td>
                              <Select
                                value={productRefs[p.id] ?? ""}
                                onValueChange={(v) => setProductRef(p.id, v)}
                              >
                                <SelectTrigger className="w-[180px]">
                                  <SelectValue placeholder="None" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  {selectableRefs.map((ref) => (
                                    <SelectItem key={ref.url} value={ref.url}>
                                      {ref.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-muted-foreground text-sm">No references on this template.</p>
                  )
                )}
              </div>
            )}
          </div>
        )}

        <Button
          className="mt-4"
          disabled={
            !selected.size ||
            submitting ||
            !template ||
            (jobRefChoice === "job" && !jobRefUrl)
          }
          onClick={startGeneration}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Starting...
            </>
          ) : (
            `Generate ${selected.size} product(s)`
          )}
        </Button>
      </div>
    </div>
  );
}
