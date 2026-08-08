import { useMemo, useState } from "react";

export function useClientPagination<T>(
  items: T[],
  defaultPageSize = 24
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  function onPageChange(next: number) {
    setPage(Math.min(Math.max(1, next), totalPages));
  }

  function onPageSizeChange(size: number) {
    setPageSize(size);
    setPage(1);
  }

  return {
    page: safePage,
    pageSize,
    total,
    totalPages,
    items: paginatedItems,
    onPageChange,
    onPageSizeChange,
    resetPage: () => setPage(1),
  };
}
