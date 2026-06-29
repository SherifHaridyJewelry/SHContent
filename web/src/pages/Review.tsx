import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, assetUrl, catalogDownloadUrl, CatalogReviewResult, HistoryEntry, Product, normalizeAssetPath, triggerDownload } from "../api";
import Pagination from "../components/Pagination";
import ReviewActions from "../components/ReviewActions";
import { useUrlParams } from "../hooks/useUrlParams";
import { parseProductIdFromOutput } from "../lib/outputNaming";
import { selectableRowClass } from "../lib/selectionStyles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Download } from "lucide-react";

const DEFAULTS = {
  page: "1",
  page_size: "12",
  state: "",
  template: "",
  failed_only: "",
};

export default function Review() {
  const { params, setParams } = useUrlParams(DEFAULTS);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.listHistory>> | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [templates, setTemplates] = useState<string[]>([]);

  const page = Number(params.page) || 1;
  const pageSize = Number(params.page_size) || 12;
  const stateFilter = params.failed_only === "true" ? "failed" : params.state || undefined;

  const load = useCallback(async () => {
    try {
      const [history, prods, tmpls] = await Promise.all([
        api.listHistory({
          page,
          page_size: pageSize,
          state: stateFilter,
          template: params.template || undefined,
        }),
        api.listProducts({ page: 1, page_size: 1000 }),
        api.listTemplates(),
      ]);
      setData(history);
      setProducts(prods.items);
      setTemplates(tmpls.map((t) => t.name));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load history");
    }
  }, [page, pageSize, stateFilter, params.template]);

  useEffect(() => {
    load();
  }, [load]);

  function productForOutput(path: string | null): Product | undefined {
    if (!path) return undefined;
    const normalized = normalizeAssetPath(path);
    const byLast = products.find((p) => {
      if (!p.last_output) return false;
      return normalizeAssetPath(p.last_output) === normalized;
    });
    if (byLast) return byLast;
    const stem = normalized.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
    const pid = parseProductIdFromOutput(stem);
    if (pid) return products.find((p) => p.id === pid);
    return undefined;
  }

  function anchorForProduct(product: Product | undefined): string | null {
    if (!product) return null;
    const anchor = product.images.find((i) => i.role === "anchor");
    return anchor?.path ?? product.images[0]?.path ?? null;
  }

  function isCanonical(product: Product | undefined, outputPath: string | null): boolean {
    if (!product?.approved_output || !outputPath) return false;
    return normalizeAssetPath(product.approved_output) === normalizeAssetPath(outputPath);
  }

  async function retry(taskId: string) {
    try {
      await api.retryHistory(taskId);
      await load();
      toast.success("Retry initiated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    }
  }

  function handleReviewUpdated(result: CatalogReviewResult) {
    if (result.product) {
      setProducts((prev) =>
        prev.map((p) => (p.id === result.product!.id ? result.product! : p))
      );
    }
    if (selected?.output_file) {
      const normalized = normalizeAssetPath(selected.output_file);
      if (normalizeAssetPath(result.output_path) === normalized) {
        setSelected({ ...selected, review_status: result.status });
      }
    }
    load();
  }

  function downloadOutput(path: string | null, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!path) return;
    triggerDownload(catalogDownloadUrl(normalizeAssetPath(path)));
  }

  const items = data?.items ?? [];

  function reviewBadgeVariant(status: string | null | undefined): "default" | "secondary" | "destructive" | "outline" {
    if (status === "approved") return "default";
    if (status === "rejected") return "destructive";
    return "outline";
  }

  return (
    <div>
      <h2>Review & History</h2>
      <p className="text-muted-foreground mb-6">
        Full generation history. Catalog shows successful outputs; use this page to triage failures.
      </p>

      <div className="card form-row mb-6 flex-wrap items-end gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block">State</label>
          <Select
            value={params.failed_only === "true" ? "failed" : params.state || "all"}
            onValueChange={(v) => {
              if (v === "failed") {
                setParams({ failed_only: "true", state: "", page: "1" });
              } else {
                setParams({ state: v === "all" ? "" : v, failed_only: "", page: "1" });
              }
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Template</label>
          <Select
            value={params.template || "all"}
            onValueChange={(v) => setParams({ template: v === "all" ? "" : v, page: "1" })}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className={selected?.output_file ? "with-detail-drawer" : undefined}>
        <div style={{ minWidth: 0 }}>
          {items.length === 0 ? (
            <EmptyState
              title="No history"
              description="No generation history entries found matching the current filters."
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
                  onPageChange={(p) => setParams({ page: String(p) })}
                  onPageSizeChange={(s) => setParams({ page_size: String(s), page: "1" })}
                />
              )}
              <table className="card" style={{ marginTop: "0.75rem" }}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Template</th>
                    <th>State</th>
                    <th>Review</th>
                    <th>Output</th>
                    <th>Job</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((h) => (
                    <tr
                      key={h.task_id}
                      className={selectableRowClass(selected?.task_id === h.task_id, "cursor-pointer")}
                      onClick={() => setSelected(h)}
                    >
                      <td className="text-xs">{h.timestamp.slice(0, 19)}</td>
                      <td>{h.template ?? "—"}</td>
                      <td>
                        <Badge variant={h.state !== "success" ? "destructive" : "default"}>
                          {h.state}
                        </Badge>
                      </td>
                      <td>
                        {h.state === "success" && (
                          <Badge
                            variant={reviewBadgeVariant(h.review_status)}
                          >
                            {h.review_status ?? "pending"}
                          </Badge>
                        )}
                      </td>
                      <td className="text-xs max-w-[200px] overflow-hidden">
                        {h.output_file?.split("/").pop()}
                      </td>
                      <td>
                        {h.job_id ? (
                          <Link to={`/tasks/${h.job_id}`} onClick={(e) => e.stopPropagation()}>
                            {h.job_id}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {h.state === "success" && h.output_file && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            aria-label="Download output"
                            onClick={(e) => downloadOutput(h.output_file, e)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        {h.state !== "success" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              retry(h.task_id);
                            }}
                          >
                            Retry
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data && (
                <Pagination
                  position="bottom"
                  page={data.page}
                  pageSize={data.page_size}
                  total={data.total}
                  totalPages={data.total_pages}
                  onPageChange={(p) => setParams({ page: String(p) })}
                  onPageSizeChange={(s) => setParams({ page_size: String(s), page: "1" })}
                />
              )}
            </>
          )}
        </div>
      </div>
      {selected?.output_file && (
          <div className="detail-drawer">
            <div className="flex justify-between items-center mb-4">
              <h3 className="m-0">Comparison</h3>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadOutput(selected.output_file)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download image
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelected(null)}
                >
                  Close
                </Button>
              </div>
            </div>
            {(() => {
              const product = productForOutput(selected.output_file);
              const anchorPath = anchorForProduct(product);
              const outputPath = normalizeAssetPath(selected.output_file);
              const canonical = isCanonical(product, selected.output_file);
              return (
                <>
                  <div className="compare">
                    <div>
                      <p className="text-muted-foreground">Raw (anchor)</p>
                      {anchorPath ? (
                        <img src={assetUrl(anchorPath)} alt="Raw" />
                      ) : (
                        <p className="text-muted-foreground">No linked anchor</p>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground">Generated</p>
                      <img src={assetUrl(selected.output_file!)} alt="Output" />
                    </div>
                  </div>
                  {product && selected.state === "success" && (
                    <div className="mt-4">
                      <p>
                        {product.name} ({product.id})
                        {canonical && (
                          <Badge variant="default" className="ml-2">
                            canonical
                          </Badge>
                        )}
                      </p>
                      <ReviewActions
                        outputPath={outputPath}
                        productId={product.id}
                        taskId={selected.task_id}
                        currentStatus={selected.review_status}
                        isCanonical={canonical}
                        onUpdated={handleReviewUpdated}
                        onError={(msg) => toast.error(msg)}
                      />
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
    </div>
  );
}