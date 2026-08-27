import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  api,
  assetUrl,
  GENERATION_MODELS,
  GenerationModel,
  isJobActive,
  Job,
  JobStatus,
  Product,
  ProductMeta,
  ProductType,
  ScenePlateJob,
  TemplateSummary,
} from "../api";
import OutputPreview from "../components/OutputPreview";
import PageHeader from "../components/PageHeader";
import Pagination from "../components/Pagination";
import ProductFilterBar from "../components/ProductFilterBar";
import SelectionBar from "../components/SelectionBar";
import {
  ProductStepper,
  TaskStepper,
  jobProgressSummary,
  statusLabel,
} from "../components/TaskStepper";
import { useClientPagination } from "../hooks/useClientPagination";
import { useJobDetail, useScenePlateJobDetail } from "../hooks/useJobDetail";
import { useUrlParams } from "../hooks/useUrlParams";
import { formatGenerationLabel } from "../lib/outputNaming";
import { typeLabel } from "../lib/productTypes";
import { selectableRowClass } from "../lib/selectionStyles";
import {
  buildSelectableReferences,
  preferredSceneRefUrl,
  referenceLabel,
  SelectableReference,
  shortReferenceLabel,
} from "../lib/templateRefs";
import { useGenerateStore } from "../stores/generateStore";
import {
  jobCanRecoverFromKie,
  SelectedTask,
  useActiveTaskCount,
  useJobStore,
} from "../stores/jobStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Label } from "@/components/ui/label";
import { Loading } from "@/components/ui/Loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AlertCircle, ChevronDown, Loader2, X } from "lucide-react";

const BATCH_DEFAULTS = {
  page: "1",
  page_size: "12",
  type: "",
  collection: "",
};

function resolveCollectionFilter(value: string): string | undefined {
  if (!value || value === "all") return undefined;
  return value;
}

function scenePlateProgressSummary(job: ScenePlateJob): string {
  const total = job.plates.length;
  const done = job.plates.filter(
    (p) => p.status === "success" || p.status === "failed"
  ).length;
  return `${done}/${total} refs`;
}

function isScenePlateActive(job: ScenePlateJob): boolean {
  return job.status === "pending" || job.status === "generating";
}

interface TaskRow {
  kind: SelectedTask["kind"];
  id: string;
  created_at: string;
  template: string;
  status: string;
  summary: string;
  active: boolean;
}

export default function Studio() {
  const navigate = useNavigate();
  const { jobId, scenePlateJobId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: "batch" | "jobs" =
    jobId || scenePlateJobId
      ? "jobs"
      : tabParam === "jobs"
        ? "jobs"
        : tabParam === "batch"
          ? "batch"
          : "batch";

  function setTab(next: "batch" | "jobs") {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", next);
    setSearchParams(nextParams, { replace: true });
    if (next === "batch" && (jobId || scenePlateJobId)) {
      navigate(`/studio?tab=batch`);
    }
  }

  return (
    <div>
      <PageHeader
        title="Studio"
        description="Select ready products, choose a shared scene reference, and run a batch."
      />

      <div className="studio-tabs">
        <button
          type="button"
          className={tab === "batch" ? "studio-tab active" : "studio-tab"}
          onClick={() => setTab("batch")}
        >
          New batch
        </button>
        <button
          type="button"
          className={tab === "jobs" ? "studio-tab active" : "studio-tab"}
          onClick={() => setTab("jobs")}
        >
          Jobs
        </button>
      </div>

      {tab === "batch" ? <BatchTab /> : <JobsTab />}
    </div>
  );
}

function BatchTab() {
  const navigate = useNavigate();
  const { params, setParams } = useUrlParams(BATCH_DEFAULTS);
  const upsertJob = useJobStore((s) => s.upsertJob);
  const refreshJobs = useJobStore((s) => s.refreshJobs);

  const selectedProductIds = useGenerateStore((s) => s.selectedProductIds);
  const template = useGenerateStore((s) => s.template);
  const selectedTemplates = useGenerateStore((s) => s.selectedTemplates);
  const analyze = useGenerateStore((s) => s.analyze);
  const model = useGenerateStore((s) => s.model);
  const jobRefChoice = useGenerateStore((s) => s.jobRefChoice);
  const jobRefUrl = useGenerateStore((s) => s.jobRefUrl);
  const productRefs = useGenerateStore((s) => s.productRefs);
  const showPerProductRefs = useGenerateStore((s) => s.showPerProductRefs);
  const toggleProduct = useGenerateStore((s) => s.toggleProduct);
  const clearSelection = useGenerateStore((s) => s.clearSelection);
  const removeFromSelection = useGenerateStore((s) => s.removeFromSelection);
  const setSelectedProductIds = useGenerateStore((s) => s.setSelectedProductIds);
  const setTemplate = useGenerateStore((s) => s.setTemplate);
  const toggleTemplate = useGenerateStore((s) => s.toggleTemplate);
  const setSelectedTemplates = useGenerateStore((s) => s.setSelectedTemplates);
  const setAnalyze = useGenerateStore((s) => s.setAnalyze);
  const setModel = useGenerateStore((s) => s.setModel);
  const setJobRefChoice = useGenerateStore((s) => s.setJobRefChoice);
  const setJobRefUrl = useGenerateStore((s) => s.setJobRefUrl);
  const setProductRef = useGenerateStore((s) => s.setProductRef);
  const setShowPerProductRefs = useGenerateStore((s) => s.setShowPerProductRefs);
  const resetTemplateRefs = useGenerateStore((s) => s.resetTemplateRefs);

  const selected = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);
  const page = Number(params.page) || 1;
  const pageSize = Number(params.page_size) || 12;
  const typeFilter = (params.type || "") as ProductType | "";
  const collectionFilter = params.collection || "";

  const [productData, setProductData] = useState<Awaited<
    ReturnType<typeof api.listProducts>
  > | null>(null);
  const [meta, setMeta] = useState<ProductMeta | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedProductsCache, setSelectedProductsCache] = useState<
    Record<string, Product>
  >({});
  const selectedProductsCacheRef = useRef(selectedProductsCache);
  selectedProductsCacheRef.current = selectedProductsCache;

  const [templateDetail, setTemplateDetail] = useState<Record<string, unknown> | null>(
    null
  );
  const [templateDetailLoading, setTemplateDetailLoading] = useState(false);
  const templateDetailCache = useRef<Record<string, Record<string, unknown>>>({});

  const products = productData?.items ?? [];
  const [showAdvancedRefs, setShowAdvancedRefs] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const autoRefForTemplate = useRef<string | null>(null);

  const defaultsApplied = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setBootstrapLoading(true);
    Promise.all([api.getProductMeta(), api.listTemplates(), api.getSettings()])
      .then(([m, tmpls, settings]) => {
        if (cancelled) return;
        setMeta(m);
        if (!defaultsApplied.current) {
          defaultsApplied.current = true;
          setAnalyze(Boolean(settings.defaults.default_analyze));
          const modelDefault = settings.defaults.default_generation_model;
          if (GENERATION_MODELS.some((x) => x.value === modelDefault)) {
            setModel(modelDefault);
          }
        }
        const jewelry = tmpls.filter((t) => t.category === "jewelry");
        const list = jewelry.length > 0 ? jewelry : tmpls;
        setTemplates(list);
        if (list.length > 0) {
          const known = new Set(list.map((t) => t.name));
          const state = useGenerateStore.getState();
          const current = state.selectedTemplates.filter((n) => known.has(n));
          if (current.length === 0) {
            const preferred =
              list.find((t) => t.name === "jewelry_catalog_4x5") ?? list[0];
            setSelectedTemplates([preferred.name]);
            setTemplate(preferred.name);
          } else if (!known.has(state.template)) {
            setTemplate(current[0]);
            setSelectedTemplates(current);
          }
        }
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load studio data");
      })
      .finally(() => {
        if (!cancelled) setBootstrapLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setTemplate, setSelectedTemplates, setAnalyze, setModel]);

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setProductsLoading(false);
    }
  }, [typeFilter, collectionFilter, page, pageSize]);

  useEffect(() => {
    loadProducts().catch(() => undefined);
  }, [loadProducts]);

  useEffect(() => {
    if (!template) return;
    const cached = templateDetailCache.current[template];
    if (cached) {
      setTemplateDetail(cached);
      return;
    }
    let cancelled = false;
    setTemplateDetailLoading(true);
    api
      .getTemplate(template)
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
  }, [template]);

  useEffect(() => {
    if (!selectedProductIds.length) return;
    const missing = selectedProductIds.filter(
      (id) => !selectedProductsCacheRef.current[id]
    );
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
    () => (templateDetail ? buildSelectableReferences(templateDetail) : []),
    [templateDetail]
  );
  const sceneRefs = useMemo(
    () => selectableRefs.filter((r) => r.source === "scene"),
    [selectableRefs]
  );
  const styleRefsList = useMemo(
    () => selectableRefs.filter((r) => r.source === "style"),
    [selectableRefs]
  );

  useEffect(() => {
    if (!template || !templateDetail) return;
    if (autoRefForTemplate.current === template) return;
    autoRefForTemplate.current = template;
    const preferred = preferredSceneRefUrl(buildSelectableReferences(templateDetail));
    if (preferred) {
      setJobRefChoice("job");
      setJobRefUrl(preferred);
    }
  }, [template, templateDetail, setJobRefChoice, setJobRefUrl]);

  const selectedTemplate = templates.find((t) => t.name === template);
  const collections = meta?.collections ?? [];
  const generatableCounts = meta?.counts_by_type_generatable ?? {};
  const generatableTotal = Object.values(generatableCounts).reduce((a, b) => a + b, 0);
  const generateCount = selected.size * selectedTemplates.length;
  const canGenerate =
    selected.size > 0 &&
    selectedTemplates.length > 0 &&
    !(jobRefChoice === "job" && !jobRefUrl);

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

  function focusTemplate(name: string) {
    if (name === template) return;
    autoRefForTemplate.current = null;
    resetTemplateRefs();
    setShowAdvancedRefs(false);
    setTemplate(name);
    setTemplateDetail(templateDetailCache.current[name] ?? null);
  }

  function handleToggleTemplate(name: string) {
    const wasSelected = selectedTemplates.includes(name);
    if (wasSelected && selectedTemplates.length <= 1) return;
    toggleTemplate(name);
    if (!wasSelected) {
      focusTemplate(name);
    } else if (template === name) {
      const next = selectedTemplates.find((t) => t !== name);
      if (next) focusTemplate(next);
    }
  }

  function handleChipClick(name: string) {
    if (!selectedTemplates.includes(name)) {
      handleToggleTemplate(name);
      return;
    }
    focusTemplate(name);
  }

  function handleChipRemove(e: MouseEvent, name: string) {
    e.stopPropagation();
    if (selectedTemplates.length <= 1) return;
    handleToggleTemplate(name);
  }

  function anchorPath(product: Product): string | null {
    const anchor = product.images.find((i) => i.role === "anchor");
    return anchor?.path ?? product.images[0]?.path ?? null;
  }

  function refThumbnail(ref: SelectableReference): string {
    if (ref.thumbnailPath?.startsWith("http")) return ref.thumbnailPath;
    if (ref.thumbnailPath) return assetUrl(ref.thumbnailPath);
    return ref.url;
  }

  async function resolveRefPayloadForTemplate(tmplName: string): Promise<{
    reference_mode: "none" | "job" | "product";
    selected_ref_url?: string;
    product_refs?: Record<string, string>;
  }> {
    if (jobRefChoice === "none") {
      return { reference_mode: "none" };
    }
    if (tmplName === template && jobRefUrl) {
      return { reference_mode: "job", selected_ref_url: jobRefUrl };
    }
    let detail = templateDetailCache.current[tmplName];
    if (!detail) {
      detail = await api.getTemplate(tmplName);
      templateDetailCache.current[tmplName] = detail;
    }
    const preferred = preferredSceneRefUrl(buildSelectableReferences(detail));
    if (preferred) {
      return { reference_mode: "job", selected_ref_url: preferred };
    }
    return { reference_mode: "none" };
  }

  async function startGeneration() {
    const templateNames =
      selectedTemplates.length > 0 ? selectedTemplates : template ? [template] : [];
    if (!selected.size || !templateNames.length) return;
    setSubmitting(true);
    const ids = Array.from(selected);
    try {
      const createdJobs = [];
      for (const tmplName of templateNames) {
        const refPayload = await resolveRefPayloadForTemplate(tmplName);
        const created = await api.createJob({
          product_ids: ids,
          template: tmplName,
          analyze,
          model,
          ...refPayload,
        });
        upsertJob(created);
        createdJobs.push(created);
      }
      await refreshJobs();
      clearSelection();
      if (createdJobs.length === 1) {
        toast.success("Generation started");
        navigate(`/studio/jobs/${createdJobs[0].id}`);
      } else {
        toast.success(
          `Started ${createdJobs.length} jobs · ${ids.length} product(s) each`
        );
        navigate("/studio?tab=jobs");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Job failed to start");
    } finally {
      setSubmitting(false);
    }
  }

  if (bootstrapLoading && !meta) {
    return <Loading variant="skeleton-grid" message="Loading..." />;
  }

  return (
    <div className="studio-batch">
      <section className="studio-products">
        <ProductFilterBar
          typeFilter={typeFilter}
          onTypeChange={(v) => setParams({ type: v, page: "1" })}
          collectionFilter={collectionFilter}
          onCollectionChange={(v) => setParams({ collection: v, page: "1" })}
          collections={collections}
          typeCounts={generatableCounts}
          typeTotal={generatableTotal}
          showStatus={false}
        />

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

        {productsLoading && !productData ? (
          <Loading variant="skeleton-list" message="Loading products..." />
        ) : products.length === 0 && !productsLoading ? (
          <EmptyState
            title="No generatable products"
            description="Assign exactly one anchor image on Products to make a SKU ready for Studio."
            icon={<AlertCircle className="h-16 w-16" />}
            action={
              <Button asChild>
                <Link to="/products">Go to Products</Link>
              </Button>
            }
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
                onPageSizeChange={(s) =>
                  setParams({ page: "1", page_size: String(s) })
                }
                position="top"
              />
            )}
            <div className="relative mt-3">
              {productsLoading && (
                <div className="table-loading-overlay">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              <div className="table-scroll">
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
                          className={selectableRowClass(
                            isRowSelected,
                            "cursor-pointer"
                          )}
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
                                className="product-thumb"
                              />
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            {p.name}
                            <div className="text-muted-foreground text-xs">
                              {p.id}
                            </div>
                          </td>
                          <td>{typeLabel(p.type)}</td>
                          <td>{p.collection ?? "—"}</td>
                          <td>
                            <Badge
                              variant={
                                p.status === "generated" ? "secondary" : "default"
                              }
                            >
                              {p.status}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {productData && (
              <Pagination
                page={productData.page}
                pageSize={productData.page_size}
                total={productData.total}
                totalPages={productData.total_pages}
                onPageChange={(p) => setParams({ page: String(p) })}
                onPageSizeChange={(s) =>
                  setParams({ page: "1", page_size: String(s) })
                }
                position="bottom"
              />
            )}
          </>
        )}
      </section>

      <section className="studio-look card">
        <div className="studio-look-header">
          <div>
            <Label className="text-xs font-medium uppercase tracking-wide">
              Templates
            </Label>
            {selectedTemplates.length > 1 && selectedTemplate && (
              <p className="text-muted-foreground mt-1 mb-0 text-xs">
                Editing scene for {selectedTemplate.template_name}
              </p>
            )}
          </div>
          <Button asChild variant="ghost" size="sm" className="h-auto px-1">
            <Link to={`/templates/${template}`}>Manage scene library</Link>
          </Button>
        </div>

        <div className="studio-template-chips">
          {templates.length === 0 ? (
            <p className="m-0 text-xs text-muted-foreground">No templates</p>
          ) : (
            templates.map((t) => {
              const checked = selectedTemplates.includes(t.name);
              const focused = template === t.name;
              return (
                <button
                  key={t.name}
                  type="button"
                  className={cn(
                    "studio-template-chip",
                    checked && "is-selected",
                    focused && "is-focused"
                  )}
                  onClick={() => handleChipClick(t.name)}
                  aria-pressed={checked}
                  aria-current={focused ? "true" : undefined}
                >
                  <span className="studio-template-chip-label">
                    {t.template_name}
                    <span className="text-muted-foreground">
                      {" "}
                      ({t.aspect_ratio})
                    </span>
                  </span>
                  {checked && selectedTemplates.length > 1 && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="studio-template-chip-remove"
                      aria-label={`Remove ${t.template_name}`}
                      onClick={(e) => handleChipRemove(e, t.name)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          handleToggleTemplate(t.name);
                        }
                      }}
                    >
                      <X className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {selectedTemplate?.background && (
          <p className="text-muted-foreground mt-3 mb-0 text-sm">
            {selectedTemplate.background}
          </p>
        )}

        {jobRefChoice === "job" && (
          <div className="mt-4">
            <div className="studio-look-header mb-2">
              <p className="mb-0 text-xs text-muted-foreground">
                Pick any empty set — type does not have to match the product.
              </p>
            </div>
            {templateDetailLoading ? (
              <p className="text-muted-foreground text-sm">
                Loading scene references…
              </p>
            ) : sceneRefs.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No scene references on this template yet.{" "}
                <Link to={`/templates/${template}`} className="underline">
                  Open scene library
                </Link>{" "}
                to distill an empty set (any type can be used for this batch).
              </p>
            ) : (
              <div className="ref-grid">
                {sceneRefs.map((ref) => {
                  const selected = jobRefUrl === ref.url;
                  return (
                    <button
                      key={ref.url}
                      type="button"
                      className={cn("ref-tile", selected && "is-selected")}
                      onClick={() => setJobRefUrl(ref.url)}
                      aria-label={`Select reference: ${shortReferenceLabel(ref.label)}`}
                      aria-pressed={selected}
                    >
                      <img
                        src={refThumbnail(ref)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="ref-thumb"
                      />
                      <span className="ref-tile-label">
                        {shortReferenceLabel(ref.label)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {jobRefChoice === "none" && (
          <p className="text-muted-foreground mt-4 mb-0 text-sm">
            Shared scene reference is off. Configure per-product references in
            Advanced below.
          </p>
        )}
      </section>

      <div className="studio-sticky-bar studio-run-bar card">
        <div className="studio-run-row">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide">
              Model
            </Label>
            <Select
              value={model}
              onValueChange={(v) => setModel(v as GenerationModel)}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GENERATION_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="studio-advanced-toggle"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
          >
            Advanced
            <ChevronDown
              className={cn(
                "ml-1 h-4 w-4 transition-transform",
                showAdvanced && "rotate-180"
              )}
            />
          </Button>

          <div className="studio-run-cta">
            {selected.size > 0 && selectedTemplates.length > 1 && (
              <p className="text-muted-foreground mb-1 text-xs">
                {selected.size} products · {selectedTemplates.length} templates
              </p>
            )}
            <Button
              disabled={!canGenerate || submitting}
              onClick={startGeneration}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : selected.size === 0 ? (
                "Select products"
              ) : (
                `Generate ${generateCount}`
              )}
            </Button>
          </div>
        </div>

        {showAdvanced && (
          <div className="studio-advanced mt-4 space-y-4 border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="vision-analysis"
                  checked={analyze}
                  onCheckedChange={(checked) => setAnalyze(checked === true)}
                />
                <Label
                  htmlFor="vision-analysis"
                  className="cursor-pointer font-normal"
                >
                  Vision analysis
                </Label>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide">
                  Scene reference
                </Label>
                <Select
                  value={jobRefChoice}
                  onValueChange={(v) => setJobRefChoice(v as "none" | "job")}
                >
                  <SelectTrigger className="w-[280px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No scene reference</SelectItem>
                    <SelectItem value="job">Shared scene reference</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {model === "gpt-image-2-image-to-image" && (
              <p className="text-muted-foreground m-0 text-sm">
                GPT Image 2: 4:5 / 5:4 may run at 1K.
              </p>
            )}

            {jobRefChoice === "job" && styleRefsList.length > 0 && (
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvancedRefs((v) => !v)}
                >
                  {showAdvancedRefs ? "Hide" : "Show"} advanced style references
                </Button>
                {showAdvancedRefs && (
                  <div className="ref-grid mt-2">
                    {styleRefsList.map((ref) => {
                      const selected = jobRefUrl === ref.url;
                      return (
                        <button
                          key={ref.url}
                          type="button"
                          className={cn("ref-tile", selected && "is-selected")}
                          onClick={() => setJobRefUrl(ref.url)}
                          aria-pressed={selected}
                        >
                          <img
                            src={refThumbnail(ref)}
                            alt=""
                            className="ref-thumb"
                            loading="lazy"
                          />
                          <span className="ref-tile-label">{ref.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {jobRefChoice === "none" && selected.size > 0 && (
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mb-3"
                  onClick={() => setShowPerProductRefs(!showPerProductRefs)}
                >
                  {showPerProductRefs ? "Hide" : "Show"} per-product references
                </Button>
                {showPerProductRefs &&
                  (templateDetailLoading ? (
                    <p className="text-muted-foreground text-sm">
                      Loading references...
                    </p>
                  ) : selectableRefs.length > 0 ? (
                    <div className="table-scroll">
                      <table className="w-full text-sm">
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
                                  value={productRefs[p.id] || "none"}
                                  onValueChange={(v) =>
                                    setProductRef(p.id, v === "none" ? "" : v)
                                  }
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
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      No references on this template.
                    </p>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function JobsTab() {
  const navigate = useNavigate();
  const { jobId, scenePlateJobId } = useParams();
  const jobs = useJobStore((s) => s.jobs);
  const scenePlateJobs = useJobStore((s) => s.scenePlateJobs);
  const loading = useJobStore((s) => s.loading);
  const selectedTask = useJobStore((s) => s.selectedTask);
  const setSelectedTask = useJobStore((s) => s.setSelectedTask);
  const refreshJobs = useJobStore((s) => s.refreshJobs);
  const activeCount = useActiveTaskCount();

  const [recovering, setRecovering] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [refLabels, setRefLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    refreshJobs().catch(() => undefined);
  }, [refreshJobs]);

  useEffect(() => {
    if (jobId) setSelectedTask({ kind: "catalog", id: jobId });
    else if (scenePlateJobId) setSelectedTask({ kind: "scene_plate", id: scenePlateJobId });
  }, [jobId, scenePlateJobId, setSelectedTask]);

  const { job: fetchedCatalog } = useJobDetail(
    selectedTask?.kind === "catalog" ? selectedTask.id : undefined
  );
  const { job: fetchedScene } = useScenePlateJobDetail(
    selectedTask?.kind === "scene_plate" ? selectedTask.id : undefined
  );

  const selectedCatalog = useMemo(() => {
    if (selectedTask?.kind !== "catalog") return null;
    return jobs.find((j) => j.id === selectedTask.id) ?? fetchedCatalog;
  }, [jobs, selectedTask, fetchedCatalog]);

  const selectedScenePlate = useMemo(() => {
    if (selectedTask?.kind !== "scene_plate") return null;
    return scenePlateJobs.find((j) => j.id === selectedTask.id) ?? fetchedScene;
  }, [scenePlateJobs, selectedTask, fetchedScene]);

  const taskRows = useMemo((): TaskRow[] => {
    const catalogRows: TaskRow[] = jobs.map((job) => ({
      kind: "catalog",
      id: job.id,
      created_at: job.created_at,
      template: job.template,
      status: job.status,
      summary: jobProgressSummary(job),
      active: isJobActive(job),
    }));
    const sceneRows: TaskRow[] = scenePlateJobs.map((job) => ({
      kind: "scene_plate",
      id: job.id,
      created_at: job.created_at,
      template: job.template,
      status: job.status,
      summary: scenePlateProgressSummary(job),
      active: isScenePlateActive(job),
    }));
    return [...catalogRows, ...sceneRows].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  }, [jobs, scenePlateJobs]);

  const {
    page,
    pageSize,
    total,
    totalPages,
    items: pagedTaskRows,
    onPageChange,
    onPageSizeChange,
  } = useClientPagination(taskRows, 10);

  useEffect(() => {
    if (!selectedCatalog?.template) return;
    api
      .getTemplate(selectedCatalog.template)
      .then((detail) => {
        const opts = buildSelectableReferences(detail);
        const map: Record<string, string> = {};
        for (const o of opts) map[o.url] = o.label;
        setRefLabels(map);
      })
      .catch(() => setRefLabels({}));
  }, [selectedCatalog?.template, selectedCatalog?.id]);

  async function handleRecover(jobIdToRecover: string) {
    setRecovering(true);
    try {
      await api.recoverJob(jobIdToRecover);
      await refreshJobs();
      toast.success("Job recovery started");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recover failed");
    } finally {
      setRecovering(false);
    }
  }

  async function handleResume(jobIdToResume: string) {
    setResuming(true);
    try {
      await api.resumeJob(jobIdToResume);
      await refreshJobs();
      toast.success("Job resumed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resume failed");
    } finally {
      setResuming(false);
    }
  }

  const showRecoverKie = selectedCatalog && jobCanRecoverFromKie(selectedCatalog);
  const showResume =
    selectedCatalog &&
    selectedCatalog.products.some((p) => p.status !== "success") &&
    !showRecoverKie;

  function taskLink(row: TaskRow): string {
    return row.kind === "scene_plate"
      ? `/studio/jobs/scene-plate/${row.id}`
      : `/studio/jobs/${row.id}`;
  }

  function isRowSelected(row: TaskRow): boolean {
    return selectedTask?.kind === row.kind && selectedTask.id === row.id;
  }

  function statusBadgeVariant(
    status: string,
    active: boolean
  ): "default" | "secondary" | "destructive" | "outline" {
    if (status === "failed") return "destructive";
    if (status === "success") return "default";
    if (active) return "default";
    return "secondary";
  }

  return (
    <div>
      <p className="text-muted-foreground mb-4">
        Catalog and scene-reference jobs.
        {activeCount > 0 && (
          <Badge variant="default" className="ml-2">
            {activeCount} running
          </Badge>
        )}
      </p>

      {loading && taskRows.length === 0 ? (
        <Loading variant="skeleton-list" message="Loading jobs..." />
      ) : taskRows.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          description="Add products, pick a shared scene reference from Templates, then start a catalog batch."
          action={
            <Button onClick={() => navigate("/studio?tab=batch")}>Start a batch</Button>
          }
        />
      ) : (
        <>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            pageSizeOptions={[10, 25, 50]}
            position="top"
          />
          <div className="table-scroll mt-3">
            <table className="card">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Type</th>
                  <th>Started</th>
                  <th>Template</th>
                  <th>Progress</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pagedTaskRows.map((row) => (
                  <tr
                    key={`${row.kind}-${row.id}`}
                    onClick={() => {
                      setSelectedTask({ kind: row.kind, id: row.id });
                      navigate(taskLink(row));
                    }}
                    className={selectableRowClass(isRowSelected(row), "cursor-pointer")}
                  >
                    <td>
                      <Link to={taskLink(row)} onClick={(e) => e.stopPropagation()}>
                        {row.id}
                      </Link>
                    </td>
                    <td>
                      <Badge variant="secondary">
                        {row.kind === "scene_plate" ? "scene refs" : "catalog"}
                      </Badge>
                    </td>
                    <td className="text-xs">{row.created_at.slice(0, 19)}</td>
                    <td>{row.template}</td>
                    <td className="text-xs text-muted-foreground">{row.summary}</td>
                    <td>
                      <Badge variant={statusBadgeVariant(row.status, row.active)}>
                        {row.active && row.kind === "catalog"
                          ? statusLabel(row.status as JobStatus)
                          : row.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            pageSizeOptions={[10, 25, 50]}
            position="bottom"
          />

          {selectedCatalog && (
            <CatalogJobDetail
              job={selectedCatalog}
              refLabels={refLabels}
              recovering={recovering}
              resuming={resuming}
              showRecoverKie={!!showRecoverKie}
              showResume={!!showResume}
              onRecover={() => handleRecover(selectedCatalog.id)}
              onResume={() => handleResume(selectedCatalog.id)}
            />
          )}

          {selectedScenePlate && <ScenePlateJobDetail job={selectedScenePlate} />}
        </>
      )}
    </div>
  );
}

function CatalogJobDetail({
  job,
  refLabels,
  recovering,
  resuming,
  showRecoverKie,
  showResume,
  onRecover,
  onResume,
}: {
  job: Job;
  refLabels: Record<string, string>;
  recovering: boolean;
  resuming: boolean;
  showRecoverKie: boolean;
  showResume: boolean;
  onRecover: () => void;
  onResume: () => void;
}) {
  return (
    <div className="card mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0">
          Catalog job {job.id}{" "}
          <Badge
            variant={
              job.status === "failed"
                ? "destructive"
                : job.status === "success"
                  ? "default"
                  : "secondary"
            }
          >
            {statusLabel(job.status)}
          </Badge>
        </h3>
        <div className="flex flex-wrap gap-2">
          {showResume && (
            <Button
              variant="default"
              disabled={resuming || recovering}
              onClick={onResume}
            >
              {resuming ? "Resuming…" : "Resume pipeline"}
            </Button>
          )}
          {showRecoverKie && (
            <Button
              variant="default"
              disabled={recovering || resuming}
              onClick={onRecover}
            >
              {recovering ? "Recovering…" : "Recover from KIE"}
            </Button>
          )}
          {job.status === "success" && (
            <Button asChild variant="secondary">
              <Link to="/outputs?tab=pending">Review in Outputs</Link>
            </Button>
          )}
        </div>
      </div>
      {job.error && <p className="text-destructive text-sm">{job.error}</p>}
      <p className="text-muted-foreground text-xs">
        {jobProgressSummary(job)} · Template:{" "}
        <Link to={`/templates/${job.template}`} className="underline">
          {job.template}
        </Link>{" "}
        · Model:{" "}
        {GENERATION_MODELS.find((m) => m.value === job.model)?.label ??
          job.model ??
          "Nano Banana 2"}{" "}
        · Analyze: {job.analyze ? "yes" : "no"} · Reference:{" "}
        {job.reference_mode === "none"
          ? "none"
          : job.reference_mode === "job"
            ? referenceLabel(
                Object.entries(refLabels).map(([url, label]) => ({
                  url,
                  source: "scene" as const,
                  sceneKey: null,
                  label,
                  thumbnailPath: null,
                })),
                job.selected_ref_url
              ) ?? job.selected_ref_url
            : "per-product"}
        {" · "}Updated: {job.updated_at.slice(0, 19)}
      </p>
      {job.reference_mode === "job" && job.selected_ref_url && (
        <div className="mt-3 flex items-center gap-3">
          <img
            src={job.selected_ref_url}
            alt="Selected scene reference"
            className="h-16 w-12 rounded object-cover border"
          />
          <div className="text-sm">
            <p className="m-0 font-medium">Shared scene reference</p>
            <Button asChild variant="ghost" size="sm" className="h-auto px-0">
              <Link to={`/templates/${job.template}`}>Open scene library</Link>
            </Button>
          </div>
        </div>
      )}

      <h4 className="mb-3 mt-5">Overall progress</h4>
      <TaskStepper status={job.status} analyze={job.analyze} />
      {isJobActive(job) && <p className="task-live-hint">Updating every few seconds…</p>}

      <h4 className="mb-3 mt-6">Products ({job.products.length})</h4>
      <div className="task-products">
        {job.products.map((p) => (
          <div key={p.product_id} className="task-product-card">
            <div className="task-product-header">
              <strong>{p.product_id}</strong>
              <Badge
                variant={
                  p.status === "failed"
                    ? "destructive"
                    : p.status === "success"
                      ? "default"
                      : isJobActive(p)
                        ? "default"
                        : "secondary"
                }
              >
                {statusLabel(p.status)}
              </Badge>
            </div>
            <p className="m-0 mb-3 text-xs text-muted-foreground">
              Output: {formatGenerationLabel(p.output_name)}
              {p.resolved_ref_url && (
                <>
                  {" · "}Ref:{" "}
                  {refLabels[p.resolved_ref_url] ?? p.resolved_ref_url.slice(-24)}
                </>
              )}
            </p>
            <ProductStepper product={p} analyze={job.analyze} />
            {p.error && <p className="mt-3 text-sm text-destructive">{p.error}</p>}
            {(p.output_image || p.output_path || p.image_url) && (
              <div className="mt-4">
                <OutputPreview
                  data={{
                    ...p,
                    run_id: p.run_id || job.id,
                    job_id: job.id,
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenePlateJobDetail({ job }: { job: ScenePlateJob }) {
  return (
    <div className="card mt-6">
      <h3>
        Scene reference job {job.id}{" "}
        <Badge
          variant={
            job.status === "failed"
              ? "destructive"
              : job.status === "success"
                ? "default"
                : "secondary"
          }
        >
          {statusLabel(job.status as JobStatus)}
        </Badge>
      </h3>
      {job.error && <p className="text-destructive text-sm">{job.error}</p>}
      <p className="text-muted-foreground text-xs">
        {scenePlateProgressSummary(job)} · Template: {job.template} · Updated:{" "}
        {job.updated_at.slice(0, 19)}
      </p>
      {isScenePlateActive(job) && (
        <p className="task-live-hint">Updating every few seconds…</p>
      )}
      <h4 className="mb-3 mt-5">Scene references ({job.plates.length})</h4>
      <ul className="m-0 pl-5">
        {job.plates.map((plate) => (
          <li key={plate.id} className="mb-1">
            <code>{plate.id}</code>{" "}
            <Badge
              variant={
                plate.status === "failed"
                  ? "destructive"
                  : plate.status === "success"
                    ? "default"
                    : "secondary"
              }
            >
              {plate.status}
            </Badge>
            {plate.error && (
              <span className="text-muted-foreground text-xs"> — {plate.error}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
