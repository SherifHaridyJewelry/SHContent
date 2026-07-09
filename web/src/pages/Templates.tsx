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
          <div className="grid mt-3">
            {pagedTemplates.map((t) => (
              <div key={t.name} className="card">
                <h3>{t.template_name}</h3>
                <p className="text-xs text-muted-foreground">
                  {t.product_type} · {t.aspect_ratio}
                </p>
                <p className="text-xs">
                  <Badge variant="default">{t.scene_ref_count} scene refs</Badge>{" "}
                  <Badge variant="secondary">{t.style_ref_count} legacy</Badge>
                </p>
                <p className="mt-2 text-xs">{t.background}</p>
                <Link
                  to={`/templates/${t.name}`}
                  className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
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
