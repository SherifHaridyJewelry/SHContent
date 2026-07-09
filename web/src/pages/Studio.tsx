import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  api,
  assetUrl,
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
  referenceLabel,
  SelectableReference,
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
import { toast } from "sonner";
import { AlertCircle, Loader2, X } from "lucide-react";

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
  return `${done}/${total} plates`;
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
        description="Select ready products, run a batch, and monitor generation jobs."
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
  const analyze = useGenerateStore((s) => s.analyze);
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
  const setJobRefChoice = useGenerateStore((s) => s.setJobRefChoice);
  const setJobRefUrl = useGenerateStore((s) => s.setJobRefUrl);
  const setProductRef = useGenerateStore((s) => s.setProductRef);
  const setShowPerProductRefs = useGenerateStore((s) => s.setShowPerProductRefs);
  const resetTemplateRefs = useGenerateStore((s) => s.resetTemplateRefs);
  const buildReferencePayload = useGenerateStore((s) => s.buildReferencePayload);

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
  const needsTemplateDetail = jobRefChoice === "job" || showPerProductRefs;

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
          const preferred =
            list.find((t) => t.name === "jewelry_catalog_4x5") ?? list[0];
          setTemplate(preferred.name);
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
  }, [setTemplate, template]);

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
    if (!template || !needsTemplateDetail) return;
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
  }, [template, needsTemplateDetail]);

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
      clearSelection();
      toast.success("Generation started");
      navigate(`/studio/jobs/${created.id}`);
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
    <div>
      <div className="studio-sticky-bar card">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide">Template</Label>
            <Select
              value={template}
              onValueChange={handleTemplateChange}
              disabled={templates.length === 0}
            >
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
          <div className="flex items-center gap-2 pb-2">
            <Checkbox
              id="vision-analysis"
              checked={analyze}
              onCheckedChange={(checked) => setAnalyze(checked === true)}
            />
            <Label htmlFor="vision-analysis" className="cursor-pointer font-normal">
              Vision analysis
            </Label>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide">Reference</Label>
            <Select
              value={jobRefChoice}
              onValueChange={(v) => setJobRefChoice(v as "none" | "job")}
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (product images only)</SelectItem>
                <SelectItem value="job">Shared reference for all</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            className="ml-auto"
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
        {selectedTemplate && (
          <p className="text-muted-foreground mt-2 mb-0 text-sm">
            {selectedTemplate.background}
          </p>
        )}

        {jobRefChoice === "job" && (
          <div className="mt-3">
            {templateDetailLoading ? (
              <p className="text-muted-foreground text-sm">Loading references...</p>
            ) : selectableRefs.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No style or scene references on this template yet.
              </p>
            ) : (
              <div className="ref-grid">
                {selectableRefs.map((ref) => (
                  <Button
                    key={ref.url}
                    type="button"
                    variant="secondary"
                    className="h-auto flex-col gap-1 p-1.5"
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
                      className="ref-thumb"
                    />
                    <span className="block text-xs">{ref.label}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {jobRefChoice === "none" && selected.size > 0 && (
          <div className="mt-3">
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
                <p className="text-muted-foreground text-sm">Loading references...</p>
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
              onPageSizeChange={(s) => setParams({ page: "1", page_size: String(s) })}
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
                              className="product-thumb"
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
                          <Badge
                            variant={p.status === "generated" ? "secondary" : "default"}
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
              onPageSizeChange={(s) => setParams({ page: "1", page_size: String(s) })}
              position="bottom"
            />
          )}
        </>
      )}
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
        Catalog and scene-plate jobs.
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
          description="Start a catalog batch from the New batch tab."
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
                        {row.kind === "scene_plate" ? "scene plates" : "catalog"}
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
        {jobProgressSummary(job)} · Template: {job.template} · Analyze:{" "}
        {job.analyze ? "yes" : "no"} · Reference:{" "}
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
        Scene plate job {job.id}{" "}
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
      <h4 className="mb-3 mt-5">Plates ({job.plates.length})</h4>
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
