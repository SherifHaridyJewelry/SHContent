import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  CatalogExportJob,
  downloadCatalogExport,
} from "../api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "sonner";
import { Download, Loader2, RefreshCw } from "lucide-react";

function scopeLabel(scope: CatalogExportJob["scope"]): string {
  if (scope === "selected") return "Selected";
  if (scope === "current_filter") return "Filtered";
  return "All catalog";
}

function statusVariant(
  status: CatalogExportJob["status"]
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "success") return "default";
  if (status === "failed") return "destructive";
  if (status === "running") return "secondary";
  return "outline";
}

interface CatalogExportsPanelProps {
  refreshToken?: number;
}

export default function CatalogExportsPanel({ refreshToken = 0 }: CatalogExportsPanelProps) {
  const [exports, setExports] = useState<CatalogExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const prevStatusRef = useRef<Record<string, CatalogExportJob["status"]>>({});

  const load = useCallback(async () => {
    try {
      const data = await api.listCatalogExports({ page: 1, page_size: 20 });
      for (const job of data.items) {
        const prev = prevStatusRef.current[job.id];
        if (prev && (prev === "pending" || prev === "running")) {
          if (job.status === "success") {
            toast.success(`Export ${job.id} ready (${job.counts.exported} images)`);
          } else if (job.status === "failed") {
            toast.error(job.error || `Export ${job.id} failed`);
          }
        }
        prevStatusRef.current[job.id] = job.status;
      }
      setExports(data.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load exports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  const hasActive = exports.some(
    (job) => job.status === "pending" || job.status === "running"
  );

  useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(() => {
      load().catch(() => undefined);
    }, 2000);
    return () => clearInterval(interval);
  }, [hasActive, load]);

  async function handleDownload(job: CatalogExportJob) {
    setDownloadingId(job.id);
    try {
      await downloadCatalogExport(job.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading && exports.length === 0) {
    return <Loading variant="skeleton-list" message="Loading exports..." />;
  }

  if (!loading && exports.length === 0) {
    return (
      <EmptyState
        title="No exports yet"
        description="Export jobs will appear here with status and download links."
      />
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="m-0 text-base font-semibold">Export jobs</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => load()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <div className="table-scroll">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-2 font-medium">Started</th>
              <th className="pb-2 font-medium">Scope</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Images</th>
              <th className="pb-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {exports.map((job) => (
              <tr key={job.id} className="border-t border-border">
                <td className="py-2 text-xs">{job.created_at.slice(0, 19).replace("T", " ")}</td>
                <td className="py-2">{scopeLabel(job.scope)}</td>
                <td className="py-2">
                  <Badge variant={statusVariant(job.status)} className="gap-1">
                    {(job.status === "pending" || job.status === "running") && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    {job.status}
                  </Badge>
                  {job.error && (
                    <div className="text-xs text-destructive mt-1 max-w-[220px]">{job.error}</div>
                  )}
                </td>
                <td className="py-2 text-xs">
                  {job.counts.exported}/{job.counts.total}
                  {job.counts.skipped > 0 && ` · ${job.counts.skipped} skipped`}
                </td>
                <td className="py-2 text-right">
                  {job.status === "success" && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={downloadingId === job.id}
                      onClick={() => handleDownload(job)}
                    >
                      {downloadingId === job.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Download className="mr-1 h-3.5 w-3.5" />
                          ZIP
                        </>
                      )}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
