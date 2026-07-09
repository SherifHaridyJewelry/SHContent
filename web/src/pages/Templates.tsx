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
        description="Brand style templates lock background, lighting, and camera. Manage scene references on each template."
      />

      {jewelryTemplates.length === 0 ? (
        <EmptyState
          title="No templates"
          description="No brand style templates have been created yet."
          icon={<Settings className="h-16 w-16" />}
          action={
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
            {pagedTemplates.map((t) => (
              <div key={t.name} className="card flex flex-col gap-3">
                <div>
                  <h3 className="m-0 text-lg font-display">{t.template_name}</h3>
                  <p className="mt-1 mb-0 text-xs text-muted-foreground">
                    {t.product_type} · {t.aspect_ratio}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="default">{t.scene_ref_count} scene refs</Badge>
                  <Badge variant="secondary">{t.style_ref_count} legacy</Badge>
                </div>
                <p className="m-0 text-sm text-muted-foreground leading-relaxed">
                  {t.background}
                </p>
                <Link
                  to={`/templates/${t.name}`}
                  className="mt-auto text-sm font-medium text-accent hover:underline"
                >
                  Manage template →
                </Link>
              </div>
            ))}
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
