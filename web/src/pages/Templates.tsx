import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, TemplateSummary } from "../api";
import PageHeader from "../components/PageHeader";
import Pagination from "../components/Pagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "sonner";
import { Settings } from "lucide-react";

export default function Templates() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .listTemplates()
      .then(setTemplates)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const jewelryTemplates = useMemo(() => {
    const jewelry = templates.filter((t) => t.category === "jewelry");
    return jewelry.length > 0 ? jewelry : templates;
  }, [templates]);

  const {
    page,
    pageSize,
    total,
    totalPages,
    items: pagedTemplates,
    onPageChange,
    onPageSizeChange,
  } = useClientPagination(jewelryTemplates, 6);

  if (loading) return <Loading variant="skeleton-grid" message="Loading templates..." />;

  return (
    <div>
      <PageHeader
        title="Templates"
        description="Brand look and scene reference library. Empty sets live here — Studio picks them when you generate."
      />

      {jewelryTemplates.length === 0 ? (
        <EmptyState
          title="No templates"
          description="Templates hold your scene reference library. Create one via the CLI, then add empty sets here before generating in Studio."
          icon={<Settings className="h-16 w-16" />}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setLoading(true);
                  api
                    .listTemplates()
                    .then(setTemplates)
                    .catch((e) => toast.error(e.message))
                    .finally(() => setLoading(false));
                }}
              >
                Refresh
              </Button>
              <Button asChild>
                <Link to="/studio?tab=batch">Go to Studio</Link>
              </Button>
            </div>
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
            pageSizeOptions={[6, 12, 24]}
            position="top"
          />
          <div className="grid mt-4">
            {pagedTemplates.map((t) => {
              const covered = t.types_covered ?? 0;
              const missing = t.types_missing ?? 0;
              return (
                <div key={t.name} className="card flex flex-col gap-3">
                  {t.preview_url ? (
                    <img
                      src={t.preview_url}
                      alt=""
                      className="thumb w-full rounded-md object-cover"
                      style={{ aspectRatio: "4 / 5", maxHeight: 200 }}
                    />
                  ) : (
                    <div
                      className="thumb flex items-center justify-center rounded-md bg-muted text-xs text-muted-foreground"
                      style={{ aspectRatio: "4 / 5", maxHeight: 200 }}
                    >
                      No scene refs yet
                    </div>
                  )}
                  <div>
                    <h3 className="m-0 text-lg font-semibold tracking-tight">
                      {t.template_name}
                    </h3>
                    <p className="mt-1 mb-0 text-xs text-muted-foreground">
                      {t.product_type} · {t.aspect_ratio}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="default">
                      {t.scene_ref_count} scene refs
                    </Badge>
                    <Badge variant="secondary">
                      {covered} types covered
                      {missing > 0 ? ` · ${missing} missing` : ""}
                    </Badge>
                    {t.style_ref_count > 0 && (
                      <Badge variant="outline">
                        {t.style_ref_count} advanced style refs
                      </Badge>
                    )}
                  </div>
                  <p className="m-0 text-sm text-muted-foreground leading-relaxed">
                    {t.background}
                  </p>
                  <Link
                    to={`/templates/${t.name}`}
                    className="mt-auto text-sm font-medium text-accent hover:underline"
                  >
                    Open scene library →
                  </Link>
                </div>
              );
            })}
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            pageSizeOptions={[6, 12, 24]}
            position="bottom"
          />
        </>
      )}
    </div>
  );
}
