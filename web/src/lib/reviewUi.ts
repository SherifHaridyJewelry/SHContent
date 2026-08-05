export type ReviewBadgeVariant = "default" | "secondary" | "destructive" | "outline";

export function reviewBadgeVariant(
  status: string | null | undefined
): ReviewBadgeVariant {
  if (status === "approved") return "default";
  if (status === "rejected") return "destructive";
  return "outline";
}

/** User-facing label for review_status values. */
export function reviewStatusLabel(status: string | null | undefined): string {
  if (status === "approved") return "Kept";
  if (status === "rejected") return "Rejected";
  if (status === "pending" || !status) return "Pending";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function reviewLabel(value: string, count?: number): string {
  const base = reviewStatusLabel(value === "approved" ? "approved" : value);
  return count !== undefined ? `${base} (${count})` : base;
}

export function anchorPathFromItem(item: {
  anchor_path?: string | null;
}): string | null {
  return item.anchor_path ?? null;
}
