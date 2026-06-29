import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, TemplateSummary } from "../api";
import Pagination from "../components/Pagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "sonner";
import { Settings } from "lucide-react";

export default function Templates() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const {
    page,
    pageSize,
    total,
    totalPages,
    items: pagedTemplates,
    onPageChange,
    onPageSizeChange,
  } = useClientPagination(templates, 6);

  useEffect(() => {
    setLoading(true);
    api
      .listTemplates()
      .then(setTemplates)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading variant="skeleton-grid" message="Loading templates..." />;

  return (
    <div>
      <h2>Templates</h2>
      <p className="text-muted-foreground mb-6">
        Brand style templates lock background, lighting, and camera settings. Manage scene references on each template detail page.
      </p>

      {templates.length === 0 ? (
        <EmptyState
          title="No templates"
          description="No brand style templates have been created yet."
          icon={<Settings className="h-16 w-16" />}
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
          <div className="grid" style={{ marginTop: "0.75rem" }}>
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
                <p className="text-xs mt-2">{t.background}</p>
                <Link
                  to={`/templates/${t.name}`}
                  className="inline-block mt-3 text-sm font-medium text-primary hover:underline"
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
