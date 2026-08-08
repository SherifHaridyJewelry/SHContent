import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export function useUrlParams<T extends Record<string, string>>(defaults: T) {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => {
    const out = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const v = searchParams.get(key);
      if (v !== null && v !== "") {
        (out as Record<string, string>)[key] = v;
      }
    }
    return out;
  }, [searchParams, defaults]);

  const setParam = useCallback(
    (key: keyof T, value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (!value || value === defaults[key as string]) {
          next.delete(String(key));
        } else {
          next.set(String(key), value);
        }
        return next;
      });
    },
    [setSearchParams, defaults]
  );

  const setParams = useCallback(
    (updates: Partial<T>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (!value || value === defaults[key]) {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        }
        return next;
      });
    },
    [setSearchParams, defaults]
  );

  return { params, setParam, setParams };
}
