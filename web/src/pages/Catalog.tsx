import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  assetUrl,
  catalogDownloadUrl,
  CatalogExportFilters,
  CatalogItem,
  CatalogReviewResult,
  triggerDownload,
} from "../api";
import CatalogExportDialog from "../components/CatalogExportDialog";
import CatalogExportsPanel from "../components/CatalogExportsPanel";
import OutputPreview from "../components/OutputPreview";
import Pagination from "../components/Pagination";
import ReviewActions from "../components/ReviewActions";
import SelectableImageCard from "../components/SelectableImageCard";
import SelectionBar from "../components/SelectionBar";
import { useUrlParams } from "../hooks/useUrlParams";
import { useSelectionSet } from "../hooks/useSelectionSet";
import { formatGenerationLabel } from "../lib/outputNaming";
import { anchorPathFromItem, reviewBadgeVariant, reviewLabel } from "../lib/reviewUi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Download } from "lucide-react";

const PAGE_SIZE_OPTIONS = [12, 24, 48];

const DEFAULTS = {
  page: "1",
  page_size: "12",
  collection: "",
  type: "",
  review: "",
  sort: "newest",
  scene_plates: "",
};

const SCENE_KEYS = [
  { value: "default", label: "As general ref" },
  { value: "ring", label: "As ring ref" },
  { value: "bracelet", label: "As bracelet ref" },
  { value: "necklace", label: "As necklace ref" },
  { value: "earrings", label: "As earrings ref" },
  { value: "half_set", label: "As half set ref" },
  { value: "full_set", label: "As full set ref" },
  { value: "general", label: "As general product ref" },
];

export default function Catalog() {
  const { params, setParams } = useUrlParams(DEFAULTS);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.listCatalog>> | null>(null);
  const [loading, setLoading] = useState(true);
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

  const page = Number(params.page) || 1;
  const pageSize = Number(params.page_size) || 12;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const catalog = await api.listCatalog({
        page,
        page_size: pageSize,
        collection: params.collection || undefined,
        product_type: params.type || undefined,
        review_status: params.review || undefined,
        sort: params.sort || "newest",
        scene_plates_only: params.scene_plates === "true",
      });
      setData(catalog);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, params.collection, params.type, params.review, params.sort, params.scene_plates]);

  useEffect(() => {
    load();
  }, [load]);

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

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (params.collection) parts.push(params.collection);
    if (params.type) parts.push(params.type);
    if (params.review) parts.push(params.review);
    if (params.scene_plates === "true") parts.push("scene plates only");
    return parts.join(" · ");
  }, [params.collection, params.type, params.review, params.scene_plates]);

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
      setDistillJobIds((prev) => ({ ...prev, [item.output_path]: job.id }));
      toast.success("Distillation started");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Distillation failed");
    } finally {
      setDistillingItems((prev) => ({ ...prev, [item.output_path]: false }));
      setDistillSceneKey("");
    }
  }

  const items = data?.items ?? [];

  function handleReviewUpdated(result: CatalogReviewResult, item?: CatalogItem) {
    const targetPath = result.output_path;
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((i) =>
          i.output_path === targetPath
            ? {
                ...i,
                review_status: result.status,
                is_canonical: result.is_canonical,
              }
            : result.is_canonical && i.product_id === result.product_id
              ? { ...i, is_canonical: false }
              : i
        ),
      };
    });
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
    load();
  }

  function openPreview(item: CatalogItem, index: number) {
    setPreviewItem(item);
    setPreviewIndex(index);
  }

  const pagePaths = useMemo(() => items.map((i) => i.output_path), [items]);

  useEffect(() => {
    if (!previewItem || previewItem.is_scene_plate) return;
    const item = previewItem;
    async function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") setPreviewItem(null);
      if (e.key === "ArrowRight" && previewIndex < items.length - 1) {
        const next = items[previewIndex + 1];
        setPreviewItem(next);
        setPreviewIndex(previewIndex + 1);
      }
      if (e.key === "ArrowLeft" && previewIndex > 0) {
        const prev = items[previewIndex - 1];
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
            set_canonical: key === "a",
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
  }, [previewItem, previewIndex, items]);

  const meta = data?.meta ?? null;
  const collections = meta?.collections ?? [];
  const reviewCounts = meta?.counts_by_review ?? {};

  return (
    <div>
      <h2>Catalog</h2>
      <p className="text-muted-foreground mb-6">
        Generated catalog images ready for social media and website.
        {meta && (
          <span className="ml-2">
            {meta.total} total · {meta.scene_plate_count} scene plates · {meta.canonical_count}{" "}
            canonical
          </span>
        )}
      </p>

      <div className="card form-row mb-6 flex-wrap items-end gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Collection</label>
          <Select
            value={params.collection || "all"}
            onValueChange={(v) => setParams({ collection: v === "all" ? "" : v, page: "1" })}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {collections.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Type</label>
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
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Review</label>
          <Select
            value={params.review || "all"}
            onValueChange={(v) => setParams({ review: v === "all" ? "" : v, page: "1" })}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">{reviewLabel("pending", reviewCounts.pending)}</SelectItem>
              <SelectItem value="approved">{reviewLabel("approved", reviewCounts.approved)}</SelectItem>
              <SelectItem value="rejected">{reviewLabel("rejected", reviewCounts.rejected)}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Sort</label>
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
        <div className="flex items-center gap-2">
          <Checkbox
            id="scene-plates-only"
            checked={params.scene_plates === "true"}
            onCheckedChange={(checked) =>
              setParams({ scene_plates: checked === true ? "true" : "", page: "1" })
            }
          />
          <Label htmlFor="scene-plates-only" className="font-normal cursor-pointer">
            Scene plates only
          </Label>
        </div>
        <div className="flex gap-2 items-center flex-wrap ml-auto">
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

      <div className="mb-6">
        <CatalogExportsPanel refreshToken={exportsRefresh} />
      </div>

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
        <Loading variant="skeleton-grid" message="Loading catalog..." />
      ) : items.length === 0 ? (
        <EmptyState
          title="No catalog images"
          description="No catalog images match the current filters."
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
          <div className="grid" style={{ marginTop: "0.75rem" }}>
            {items.map((item, index) => (
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
                  <div className="flex gap-1 flex-wrap mt-2">
                    {item.is_scene_plate && <Badge variant="secondary">scene plate</Badge>}
                    {item.is_canonical && <Badge variant="default">canonical</Badge>}
                    {item.product_type && <Badge variant="secondary">{item.product_type}</Badge>}
                    {item.collection && <Badge variant="secondary">{item.collection}</Badge>}
                    <Badge variant={reviewBadgeVariant(item.review_status)}>
                      {item.review_status ?? "pending"}
                    </Badge>
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
        <div className="lightbox" onClick={() => setPreviewItem(null)}>
          <div className="lightbox-content card" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="secondary"
              size="sm"
              className="lightbox-close"
              onClick={() => setPreviewItem(null)}
            >
              Close
            </Button>
            <h3>
              {previewItem.output_label ??
                previewItem.product_name ??
                formatGenerationLabel(
                  previewItem.output_path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? ""
                )}
            </h3>
            <div className="flex gap-2 flex-wrap mb-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadItem(previewItem)}
              >
                <Download className="mr-2 h-4 w-4" />
                Download image
              </Button>
            </div>
            <div className="flex gap-1 flex-wrap mb-3">
              {previewItem.is_canonical && <Badge variant="default">canonical</Badge>}
              <Badge variant={reviewBadgeVariant(previewItem.review_status)}>
                {previewItem.review_status ?? "pending"}
              </Badge>
            </div>
            <div className="compare">
              <div>
                <p className="text-muted-foreground">Raw (anchor)</p>
                {(() => {
                  const raw = anchorPathFromItem(previewItem);
                  return raw ? (
                    <img src={assetUrl(raw)} alt="Raw" loading="lazy" />
                  ) : (
                    <p className="text-muted-foreground">No linked product anchor</p>
                  );
                })()}
              </div>
              <div>
                <p className="text-muted-foreground">Generated</p>
                <OutputPreview data={previewItem} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {previewItem.template && <>Template: {previewItem.template} · </>}
              Source: {previewItem.source}
              {previewItem.timestamp && <> · {previewItem.timestamp.slice(0, 19)}</>}
              {previewItem.task_id && <> · Task: {previewItem.task_id}</>}
              {previewItem.run_id && <> · Run: {previewItem.run_id}</>}
            </p>
            {previewItem.product_id && !previewItem.is_scene_plate && (
              <div className="mt-4">
                <ReviewActions
                  outputPath={previewItem.output_path}
                  productId={previewItem.product_id}
                  taskId={previewItem.task_id}
                  currentStatus={previewItem.review_status}
                  isCanonical={previewItem.is_canonical}
                  onUpdated={(r) => handleReviewUpdated(r, previewItem)}
                  onError={(msg) => toast.error(msg)}
                />
                {previewItem.template && (
                  <div className="mt-3 flex gap-2 items-center flex-wrap">
                    <span className="text-xs text-muted-foreground">Reuse as reference:</span>
                    <Select
                      value={distillSceneKey || undefined}
                      onValueChange={setDistillSceneKey}
                    >
                      <SelectTrigger className="text-xs h-8 w-[160px]">
                        <SelectValue placeholder="Distill to scene ref..." />
                      </SelectTrigger>
                      <SelectContent>
                        {SCENE_KEYS.map((sk) => (
                          <SelectItem key={sk.value} value={sk.value}>
                            {sk.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!distillSceneKey || distillingItems[previewItem.output_path]}
                      onClick={() => startDistill(previewItem)}
                    >
                      {distillingItems[previewItem.output_path] ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Distilling...</>
                      ) : (
                        "Distill"
                      )}
                    </Button>
                    {distillJobIds[previewItem.output_path] && (
                      <Link
                        to={`/tasks/scene-plate/${distillJobIds[previewItem.output_path]}`}
                        className="text-xs"
                      >
                        Job →
                      </Link>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Shortcuts: A approve · R reject · P reset · Esc close · ← → navigate
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}