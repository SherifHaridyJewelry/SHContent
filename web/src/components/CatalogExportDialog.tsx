import { useEffect, useState } from "react";
import {
  api,
  CatalogExportFilters,
  CatalogExportScope,
} from "../api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface CatalogExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPaths: string[];
  filters: CatalogExportFilters;
  filterSummary: string;
  selectedCount: number;
  filteredCount: number;
  allCount: number;
  onExportStarted: () => void;
  onError: (message: string) => void;
}

export default function CatalogExportDialog({
  open,
  onOpenChange,
  selectedPaths,
  filters,
  filterSummary,
  selectedCount,
  filteredCount,
  allCount,
  onExportStarted,
  onError,
}: CatalogExportDialogProps) {
  const [scope, setScope] = useState<CatalogExportScope>("current_filter");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setScope(selectedCount > 0 ? "selected" : "current_filter");
    }
  }, [open, selectedCount]);

  const countForScope =
    scope === "selected"
      ? selectedCount
      : scope === "current_filter"
        ? filteredCount
        : allCount;

  async function handleExport() {
    setSubmitting(true);
    try {
      const body =
        scope === "selected"
          ? { scope, output_paths: selectedPaths }
          : scope === "current_filter"
            ? { scope, filters }
            : { scope };
      await api.createCatalogExport(body);
      onExportStarted();
      onOpenChange(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Export failed to start");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle>Export images</DialogTitle>
          <DialogDescription>
            Download a ZIP of generated catalog images.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Scope</p>
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as CatalogExportScope)}
              disabled={submitting}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="selected"
                  id="export-scope-selected"
                  disabled={selectedCount === 0 || submitting}
                />
                <Label htmlFor="export-scope-selected" className="cursor-pointer font-normal">
                  Selected images ({selectedCount})
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="current_filter" id="export-scope-filter" />
                <Label htmlFor="export-scope-filter" className="cursor-pointer font-normal">
                  Current filters ({filteredCount})
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all_catalog" id="export-scope-all" />
                <Label htmlFor="export-scope-all" className="cursor-pointer font-normal">
                  All catalog images ({allCount})
                </Label>
              </div>
            </RadioGroup>
            {scope === "current_filter" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Active filters: {filterSummary || "All catalog images matching default view"}
              </p>
            )}
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">Contents</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Images + manifest.json</li>
              <li>Folder layout: collection / review-status / image-name.jpg</li>
              <li>Filenames use product/catalog labels</li>
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            Some local files may be fetched from remote storage if needed.
            Unavailable images will be recorded in manifest.json.
          </p>

          <p className="text-xs text-muted-foreground">
            {countForScope} image(s) in this export.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={submitting || countForScope === 0}
            onClick={handleExport}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              "Export"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
