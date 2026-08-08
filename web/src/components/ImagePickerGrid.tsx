import { useCallback, useEffect, useState } from "react";
import { api, assetUrl } from "../api";
import Pagination from "./Pagination";
import SelectableImageCard from "./SelectableImageCard";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { Image } from "lucide-react";

interface ImagePickerGridProps {
  selected: Set<string>;
  onToggle: (path: string) => void;
  scenePlatesOnly?: boolean;
}

export default function ImagePickerGrid({
  selected,
  onToggle,
  scenePlatesOnly = false,
}: ImagePickerGridProps) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(24);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.listCatalog>> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.listCatalog({
        page,
        page_size: pageSize,
        scene_plates_only: scenePlatesOnly,
        sort: "newest",
      });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, scenePlatesOnly]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <Loading variant="skeleton-grid" count={pageSize} />;

  const items = data?.items ?? [];

  if (!loading && items.length === 0) {
    return (
      <EmptyState
        title="No images found"
        description="No catalog images match your criteria."
        icon={<Image className="h-16 w-16" />}
      />
    );
  }

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 max-h-[420px] overflow-auto">
        {items.map((item) => (
          <SelectableImageCard
            key={item.id}
            className="p-1.5"
            imageSrc={assetUrl(item.output_path)}
            imageAlt={item.output_label ?? item.product_name ?? item.output_path}
            label={
              <span className="text-xs">
                {item.is_scene_plate ? "scene ref" : item.product_id ?? item.product_name}
              </span>
            }
            checked={selected.has(item.output_path)}
            onToggle={() => onToggle(item.output_path)}
            onImageError={(e) => {
              const fallback = item.output_r2_url || item.image_url;
              if (fallback && e.currentTarget.src !== fallback) {
                e.currentTarget.src = fallback;
              }
            }}
          />
        ))}
      </div>
      {data && data.total_pages > 1 && (
        <Pagination
          position="both"
          page={data.page}
          pageSize={data.page_size}
          total={data.total}
          totalPages={data.total_pages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
