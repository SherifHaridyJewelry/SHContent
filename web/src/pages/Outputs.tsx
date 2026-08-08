import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  assetUrl,
  catalogDownloadUrl,
  CatalogExportFilters,
  CatalogItem,
  CatalogReviewResult,
  HistoryEntry,
  normalizeAssetPath,
  triggerDownload,
} from "../api";
import CatalogExportDialog from "../components/CatalogExportDialog";
import CatalogExportsPanel from "../components/CatalogExportsPanel";
import OutputLightbox from "../components/OutputLightbox";
import PageHeader from "../components/PageHeader";
import Pagination from "../components/Pagination";
import PendingReviewStack from "../components/PendingReviewStack";
import SelectableImageCard from "../components/SelectableImageCard";
import SelectionBar from "../components/SelectionBar";
import { useCatalogQuery } from "../hooks/useCatalogQuery";
import { notifyPendingReviewChanged } from "../hooks/usePendingReviewCount";
import { useSelectionSet } from "../hooks/useSelectionSet";
import { useUrlParams } from "../hooks/useUrlParams";
import { formatGenerationLabel } from "../lib/outputNaming";
import {
  reviewBadgeVariant,
  reviewLabel,
  reviewStatusLabel,
} from "../lib/reviewUi";
import { selectableRowClass } from "../lib/selectionStyles";
import { useJobStore } from "../stores/jobStore";
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
import { Download } from "lucide-react";

const PAGE_SIZE_OPTIONS = [12, 24, 48];

type OutputsTab = "gallery" | "pending" | "failed" | "exports";

const DEFAULTS = {
  tab: "",
  page: "1",
  page_size: "12",
  collection: "",
  type: "",
  review: "",
  sort: "newest",
  scene_plates: "",
  include_assets: "",
  product: "",
  failed_page: "1",
  failed_page_size: "12",
};

export default function Outputs() {
  const { params, setParams } = useUrlParams(DEFAULTS);
  const upsertScenePlateJob = useJobStore((s) => s.upsertScenePlateJob);

  const [metaBootstrap, setMetaBootstrap] = useState<{
    pending: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    api
      .getCatalogMeta()
      .then((m) =>
        setMetaBootstrap({
          pending: m.counts_by_review?.pending ?? 0,
          total: m.total,
        })
      )
      .catch(() => undefined);
  }, []);

  const resolvedTab: OutputsTab = useMemo(() => {
    const t = params.tab;
    if (t === "gallery" || t === "pending" || t === "failed" || t === "exports") {
      return t;
    }
    if (metaBootstrap && metaBootstrap.pending > 0) return "pending";
    return "gallery";
  }, [params.tab, metaBootstrap]);

  function setTab(tab: OutputsTab) {
    setParams({ tab, page: "1", failed_page: "1" });
  }

  const handleMeta = useCallback((pending: number, total: number) => {
    setMetaBootstrap((prev) => {
      if (prev && prev.pending === pending && prev.total === total) return prev;
      return { pending, total };
    });
    notifyPendingReviewChanged(pending);
  }, []);

  return (
    <div>
      <PageHeader
        title="Outputs"
        description="Keep a shortlist, pick product heroes later, triage failures, and export."
      />

      <div className="studio-tabs">
        {(
          [
            ["gallery", "Gallery"],
            ["pending", "Pending"],
            ["failed", "Failed"],
            ["exports", "Exports"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={resolvedTab === id ? "studio-tab active" : "studio-tab"}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "pending" && metaBootstrap && metaBootstrap.pending > 0 && (
              <span className="nav-badge ml-1">{metaBootstrap.pending}</span>
            )}
          </button>
        ))}
      </div>

      {resolvedTab === "pending" && <PendingReviewStack onMeta={handleMeta} />}
      {resolvedTab === "gallery" && (
        <GalleryTab
          params={params}
          setParams={setParams}
          upsertScenePlateJob={upsertScenePlateJob}
          onMeta={handleMeta}
        />
      )}
      {resolvedTab === "failed" && (
        <FailedTab params={params} setParams={setParams} />
      )}
      {resolvedTab === "exports" && <ExportsTab params={params} />}
    </div>
  );
}

function GalleryTab({
  params,
  setParams,
  upsertScenePlateJob,
  onMeta,
}: {
  params: Record<string, string>;
  setParams: (patch: Record<string, string>) => void;
  upsertScenePlateJob: (job: Awaited<ReturnType<typeof api.distillSceneRef>>) => void;
  onMeta: (pending: number, total: number) => void;
}) {
  const page = Number(params.page) || 1;
  const pageSize = Number(params.page_size) || 12;
  const reviewStatus = params.review || undefined;

  const includeTemplateAssets = params.include_assets === "true";

  const { data, loading, reload, items, meta } = useCatalogQuery({
    page,
    pageSize,
    collection: params.collection,
    productType: params.type || undefined,
    reviewStatus,
    sort: params.sort || "newest",
    scenePlatesOnly: false,
    excludeScenePlates: !includeTemplateAssets,
    productId: params.product || undefined,
  });

  useEffect(() => {
    if (meta) {
      onMeta(meta.counts_by_review?.pending ?? 0, meta.total);
    }
  }, [meta, onMeta]);

  const filteredItems = items;

  const [previewItem, setPreviewItem] = useState<CatalogItem | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [distillSceneKey, setDistillSceneKey] = useState("");
  const [distillingItems, setDistillingItems] = useState<Record<string, boolean>>({});
  const [distillJobIds, setDistillJobIds] = useState<Record<string, string>>({});
  const {
    selected: selectedPaths,
    toggle: toggleSelected,
    toggleAll: toggleAllOnPage,
    clear: clearSelection,
  } = useSelectionSet<string>();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportsRefresh, setExportsRefresh] = useState(0);

  const exportFilters: CatalogExportFilters = useMemo(
    () => ({
      collection: params.collection || null,
      product_type: params.type || null,
      review_status: reviewStatus || null,
      sort: params.sort || "newest",
      scene_plates_only: false,
    }),
    [params.collection, params.type, reviewStatus, params.sort]
  );

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (params.collection) parts.push(params.collection);
    if (params.type) parts.push(params.type);
    if (reviewStatus) parts.push(reviewStatus);
    if (includeTemplateAssets) parts.push("including template assets");
    if (params.product) parts.push(`product ${params.product}`);
    return parts.join(" · ");
  }, [
    params.collection,
    params.type,
    reviewStatus,
    includeTemplateAssets,
    params.product,
  ]);

  function downloadItem(item: CatalogItem, e?: React.MouseEvent) {
    e?.stopPropagation();
    triggerDownload(catalogDownloadUrl(item.output_path));
  }

  async function startDistill(item: CatalogItem) {
    if (!distillSceneKey || !item.template) return;
    setDistillingItems((prev) => ({ ...prev, [item.output_path]: true }));
    try {
      const job = await api.distillSceneRef(item.template, {
        output_path: item.output_path,
        scene_key: distillSceneKey,
      });
      upsertScenePlateJob(job);
      setDistillJobIds((prev) => ({ ...prev, [item.output_path]: job.id }));
      const tmpl = item.template!;
      const key = distillSceneKey;
      toast.success(`Creating scene reference · ${key}`, {
        description: `Will be added to ${tmpl} when the job finishes.`,
        action: {
          label: "Scene library",
          onClick: () => {
            window.location.href = `/templates/${tmpl}`;
          },
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create scene reference");
    } finally {
      setDistillingItems((prev) => ({ ...prev, [item.output_path]: false }));
      setDistillSceneKey("");
    }
  }

  function handleReviewUpdated(result: CatalogReviewResult, item?: CatalogItem) {
    const targetPath = result.output_path;
    if (item && previewItem?.output_path === targetPath) {
      setPreviewItem((s) =>
        s
          ? {
              ...s,
              review_status: result.status,
              is_canonical: result.is_canonical,
            }
          : s
      );
    }
    reload();
    notifyPendingReviewChanged();
  }

  function openPreview(item: CatalogItem, index: number) {
    setPreviewItem(item);
    setPreviewIndex(index);
  }

  const pagePaths = useMemo(
    () => filteredItems.map((i) => i.output_path),
    [filteredItems]
  );

  useEffect(() => {
    if (!previewItem || previewItem.is_scene_plate) return;
    const item = previewItem;
    async function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
        return;
      if (e.key === "Escape") setPreviewItem(null);
      if (e.key === "ArrowRight" && previewIndex < filteredItems.length - 1) {
        const next = filteredItems[previewIndex + 1];
        setPreviewItem(next);
        setPreviewIndex(previewIndex + 1);
      }
      if (e.key === "ArrowLeft" && previewIndex > 0) {
        const prev = filteredItems[previewIndex - 1];
        setPreviewItem(prev);
        setPreviewIndex(previewIndex - 1);
      }
      if (!item.product_id) return;
      const key = e.key.toLowerCase();
      if (key === "a" || key === "r" || key === "p") {
        e.preventDefault();
        try {
          const status = key === "a" ? "approved" : key === "r" ? "rejected" : "pending";
          const result = await api.setCatalogReview({
            output_path: item.output_path,
            status,
            set_canonical: false,
            product_id: item.product_id,
            task_id: item.task_id ?? undefined,
          });
          handleReviewUpdated(result, item);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Review update failed");
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewItem, previewIndex, filteredItems]);

  const collections = meta?.collections ?? [];
  const reviewCounts = meta?.counts_by_review ?? {};

  return (
    <div>
      {meta && (
        <div className="outputs-summary mb-5">
          <p className="text-muted-foreground m-0 text-sm">
            <span>{meta.total} outputs</span>
            <span className="outputs-summary-sep">·</span>
            <span>{reviewCounts.approved ?? 0} kept</span>
            <span className="outputs-summary-sep">·</span>
            <span>{reviewCounts.pending ?? 0} pending</span>
            <span className="outputs-summary-sep">·</span>
            <span>{meta.canonical_count} heroes</span>
            {params.product && (
              <>
                <span className="outputs-summary-sep">·</span>
                <span>
                  Product <code>{params.product}</code>{" "}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto px-1"
                    onClick={() => setParams({ product: "" })}
                  >
                    Clear
                  </Button>
                </span>
              </>
            )}
          </p>
          {meta.canonical_count === 0 && (reviewCounts.approved ?? 0) > 0 && (
            <p className="outputs-summary-hint m-0 text-xs text-muted-foreground">
              Heroes are optional. Open a product to pick one from its kept shortlist.
            </p>
          )}
          <p className="outputs-summary-hint m-0 text-xs text-muted-foreground">
            Gallery shows product outputs.{" "}
            <Link to="/templates" className="underline">
              Manage scene references on Templates
            </Link>
            .
          </p>
        </div>
      )}

      <div className="card filter-panel form-row mb-5 flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium uppercase tracking-wide">Collection</Label>
          <Select
            value={params.collection || "all"}
            onValueChange={(v) =>
              setParams({ collection: v === "all" ? "" : v, page: "1" })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {collections.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium uppercase tracking-wide">Type</Label>
          <Select
            value={params.type || "all"}
            onValueChange={(v) => setParams({ type: v === "all" ? "" : v, page: "1" })}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {(meta?.product_types ?? []).map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium uppercase tracking-wide">Status</Label>
          <Select
            value={params.review || "all"}
            onValueChange={(v) =>
              setParams({ review: v === "all" ? "" : v, page: "1" })
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">
                {reviewLabel("pending", reviewCounts.pending)}
              </SelectItem>
              <SelectItem value="approved">
                {reviewLabel("approved", reviewCounts.approved)}
              </SelectItem>
              <SelectItem value="rejected">
                {reviewLabel("rejected", reviewCounts.rejected)}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium uppercase tracking-wide">Sort</Label>
          <Select
            value={params.sort || "newest"}
            onValueChange={(v) => setParams({ sort: v, page: "1" })}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="filter-inline-action flex items-center gap-2 pb-2">
          <Checkbox
            id="include-template-assets"
            checked={includeTemplateAssets}
            onCheckedChange={(checked) =>
              setParams({
                include_assets: checked === true ? "true" : "",
                page: "1",
              })
            }
          />
          <Label htmlFor="include-template-assets" className="cursor-pointer font-normal">
            Include template assets
          </Label>
        </div>
        <div className="filter-actions ml-auto flex flex-wrap items-center gap-2 pb-0.5">
          <Button variant="secondary" size="sm" onClick={() => setExportDialogOpen(true)}>
            Export
          </Button>
        </div>
      </div>

      <CatalogExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        selectedPaths={Array.from(selectedPaths)}
        filters={exportFilters}
        filterSummary={filterSummary}
        selectedCount={selectedPaths.size}
        filteredCount={data?.total ?? 0}
        allCount={meta?.total ?? 0}
        onExportStarted={() => {
          setExportsRefresh((n) => n + 1);
          toast.success("Export started");
        }}
        onError={(msg) => toast.error(msg)}
      />

      <SelectionBar
        count={selectedPaths.size}
        onClearAll={clearSelection}
        onSelectAllOnPage={() => toggleAllOnPage(pagePaths)}
        actions={
          <Button variant="secondary" size="sm" onClick={() => setExportDialogOpen(true)}>
            Export selected
          </Button>
        }
      />

      {loading ? (
        <Loading variant="skeleton-grid" message="Loading outputs..." />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title="No product outputs"
          description="Generate in Studio, then Keep or Reject here. Scene references live under Templates."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link to="/studio?tab=batch">Go to Studio</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/templates">Manage scene library</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {data && (
            <Pagination
              position="top"
              page={data.page}
              pageSize={data.page_size}
              total={data.total}
              totalPages={data.total_pages}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageChange={(p) => setParams({ page: String(p) })}
              onPageSizeChange={(s) => setParams({ page_size: String(s), page: "1" })}
            />
          )}
          <div className="grid mt-3">
            {filteredItems.map((item, index) => (
              <SelectableImageCard
                key={item.id}
                imageSrc={assetUrl(item.output_path)}
                imageAlt={item.output_label ?? item.product_name ?? item.output_path}
                label={
                  <>
                    {item.output_label ??
                      item.product_name ??
                      formatGenerationLabel(
                        item.output_path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? ""
                      )}
                  </>
                }
                footer={
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.is_canonical && <Badge variant="default">Hero</Badge>}
                    {item.is_scene_plate ? (
                      <Badge variant="outline">Scene reference</Badge>
                    ) : (
                      <Badge variant={reviewBadgeVariant(item.review_status)}>
                        {reviewStatusLabel(item.review_status)}
                      </Badge>
                    )}
                    {item.product_type && (
                      <Badge variant="secondary">{item.product_type}</Badge>
                    )}
                    {item.collection && (
                      <Badge variant="secondary">{item.collection}</Badge>
                    )}
                  </div>
                }
                checked={selectedPaths.has(item.output_path)}
                onToggle={() => toggleSelected(item.output_path)}
                onPreview={() => openPreview(item, index)}
                actions={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="Download image"
                    onClick={(e) => downloadItem(item, e)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                }
                onImageError={(e) => {
                  const fallback = item.output_r2_url || item.image_url;
                  if (fallback && e.currentTarget.src !== fallback) {
                    e.currentTarget.src = fallback;
                  }
                }}
              />
            ))}
          </div>
          {data && (
            <Pagination
              position="bottom"
              page={data.page}
              pageSize={data.page_size}
              total={data.total}
              totalPages={data.total_pages}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageChange={(p) => setParams({ page: String(p) })}
              onPageSizeChange={(s) => setParams({ page_size: String(s), page: "1" })}
            />
          )}
        </>
      )}

      {previewItem && (
        <OutputLightbox
          item={previewItem}
          distillSceneKey={distillSceneKey}
          onDistillSceneKeyChange={setDistillSceneKey}
          distilling={distillingItems[previewItem.output_path]}
          distillJobId={distillJobIds[previewItem.output_path]}
          onDistill={() => startDistill(previewItem)}
          onClose={() => setPreviewItem(null)}
          onReviewUpdated={(r) => handleReviewUpdated(r, previewItem)}
          onError={(msg) => toast.error(msg)}
        />
      )}

      {/* keep exportsRefresh referenced for dialog callback side-effect */}
      <span className="hidden">{exportsRefresh}</span>
    </div>
  );
}

function FailedTab({
  params,
  setParams,
}: {
  params: Record<string, string>;
  setParams: (patch: Record<string, string>) => void;
}) {
  const page = Number(params.failed_page) || 1;
  const pageSize = Number(params.failed_page_size) || 12;
  const [data, setData] = useState<Awaited<ReturnType<typeof api.listHistory>> | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const history = await api.listHistory({
        page,
        page_size: pageSize,
        state: "failed",
      });
      setData(history);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load failures");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  async function retry(taskId: string) {
    try {
      await api.retryHistory(taskId);
      await load();
      toast.success("Retry initiated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    }
  }

  const items = data?.items ?? [];

  return (
    <div>
      {loading ? (
        <Loading variant="skeleton-list" message="Loading failures..." />
      ) : items.length === 0 ? (
        <EmptyState
          title="No failed runs"
          description="Failed generations will appear here for retry."
          action={
            <Button asChild variant="secondary">
              <Link to="/studio?tab=jobs">View jobs</Link>
            </Button>
          }
        />
      ) : (
        <>
          {data && (
            <Pagination
              position="top"
              page={data.page}
              pageSize={data.page_size}
              total={data.total}
              totalPages={data.total_pages}
              onPageChange={(p) => setParams({ failed_page: String(p) })}
              onPageSizeChange={(s) =>
                setParams({ failed_page_size: String(s), failed_page: "1" })
              }
            />
          )}
          <div className="table-scroll mt-3">
            <table className="card">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Template</th>
                  <th>Task</th>
                  <th>Error</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr
                    key={entry.task_id}
                    className={selectableRowClass(
                      selected?.task_id === entry.task_id,
                      "cursor-pointer"
                    )}
                    onClick={() => setSelected(entry)}
                  >
                    <td className="text-xs">
                      {(entry.timestamp || "").slice(0, 19)}
                    </td>
                    <td>{entry.template ?? "—"}</td>
                    <td className="text-xs">
                      <code>{entry.task_id}</code>
                    </td>
                    <td className="max-w-[240px] truncate text-xs text-destructive">
                      {typeof entry.extra?.error === "string"
                        ? entry.extra.error
                        : entry.state}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => retry(entry.task_id)}>
                          Retry
                        </Button>
                        {entry.job_id && (
                          <Button asChild size="sm" variant="ghost">
                            <Link to={`/studio/jobs/${entry.job_id}`}>Job</Link>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && (
            <Pagination
              position="bottom"
              page={data.page}
              pageSize={data.page_size}
              total={data.total}
              totalPages={data.total_pages}
              onPageChange={(p) => setParams({ failed_page: String(p) })}
              onPageSizeChange={(s) =>
                setParams({ failed_page_size: String(s), failed_page: "1" })
              }
            />
          )}
          {selected && (
            <div className="card mt-4">
              <h3 className="m-0">Failure detail</h3>
              <p className="text-sm text-muted-foreground">
                Task <code>{selected.task_id}</code>
                {selected.job_id && (
                  <>
                    {" · "}
                    <Link to={`/studio/jobs/${selected.job_id}`}>Open job</Link>
                  </>
                )}
              </p>
              {typeof selected.extra?.error === "string" && (
                <p className="text-sm text-destructive whitespace-pre-wrap">
                  {selected.extra.error}
                </p>
              )}
              {selected.output_file && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    triggerDownload(
                      catalogDownloadUrl(normalizeAssetPath(selected.output_file!))
                    )
                  }
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download output
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ExportsTab({ params }: { params: Record<string, string> }) {
  const [exportsRefresh, setExportsRefresh] = useState(0);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const exportFilters: CatalogExportFilters = useMemo(
    () => ({
      collection: params.collection || null,
      product_type: params.type || null,
      review_status: params.review || null,
      sort: params.sort || "newest",
      scene_plates_only: params.scene_plates === "true",
    }),
    [params.collection, params.type, params.review, params.sort, params.scene_plates]
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground m-0 text-sm">
          Create ZIP exports of catalog images for social or website use.
        </p>
        <Button onClick={() => setExportDialogOpen(true)}>New export</Button>
      </div>
      <CatalogExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        selectedPaths={[]}
        filters={exportFilters}
        filterSummary="Current gallery filters"
        selectedCount={0}
        filteredCount={0}
        allCount={0}
        onExportStarted={() => {
          setExportsRefresh((n) => n + 1);
          toast.success("Export started");
        }}
        onError={(msg) => toast.error(msg)}
      />
      <CatalogExportsPanel refreshToken={exportsRefresh} />
    </div>
  );
}
