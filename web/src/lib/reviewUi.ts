export type ReviewBadgeVariant = "default" | "secondary" | "destructive" | "outline";

export function reviewBadgeVariant(
  status: string | null | undefined
): ReviewBadgeVariant {
  if (status === "approved") return "default";
  if (status === "rejected") return "destructive";
  return "outline";
}

export function reviewLabel(value: string, count?: number): string {
  const base = value.charAt(0).toUpperCase() + value.slice(1);
  return count !== undefined ? `${base} (${count})` : base;
}

export function anchorPathFromItem(item: {
  anchor_path?: string | null;
}): string | null {
  return item.anchor_path ?? null;
}
