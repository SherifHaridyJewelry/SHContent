import { useCallback, useMemo, useState } from "react"

export function useSelectionSet<T extends string = string>(initial: Iterable<T> = []) {
  const [selected, setSelected] = useState<Set<T>>(() => new Set(initial))

  const toggle = useCallback((id: T) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback((ids: Iterable<T>) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      return next
    })
  }, [])

  const deselectAll = useCallback((ids: Iterable<T>) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
  }, [])

  const setAll = useCallback((ids: Iterable<T>) => {
    setSelected(new Set(ids))
  }, [])

  const clear = useCallback(() => {
    setSelected(new Set())
  }, [])

  const isSelected = useCallback((id: T) => selected.has(id), [selected])

  const isAllSelected = useCallback(
    (ids: readonly T[]) => ids.length > 0 && ids.every((id) => selected.has(id)),
    [selected]
  )

  const isIndeterminate = useCallback(
    (ids: readonly T[]) => {
      if (ids.length === 0) return false
      const count = ids.filter((id) => selected.has(id)).length
      return count > 0 && count < ids.length
    },
    [selected]
  )

  const toggleAll = useCallback((ids: readonly T[]) => {
    setSelected((prev) => {
      const allOnPage = ids.every((id) => prev.has(id))
      const next = new Set(prev)
      if (allOnPage) {
        for (const id of ids) next.delete(id)
      } else {
        for (const id of ids) next.add(id)
      }
      return next
    })
  }, [])

  return useMemo(
    () => ({
      selected,
      setSelected,
      toggle,
      selectAll,
      deselectAll,
      setAll,
      clear,
      isSelected,
      isAllSelected,
      isIndeterminate,
      toggleAll,
      size: selected.size,
    }),
    [
      selected,
      toggle,
      selectAll,
      deselectAll,
      setAll,
      clear,
      isSelected,
      isAllSelected,
      isIndeterminate,
      toggleAll,
    ]
  )
}
