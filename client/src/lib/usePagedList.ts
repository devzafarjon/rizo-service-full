import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "./api";

export const PAGE_SIZE = 50;

/**
 * A list that loads PAGE_SIZE rows at a time and appends the next page on request ("Load more").
 * `path` is the endpoint with its filters as a query string (no limit/offset); the endpoint answers `{ [itemsKey]: T[], total, hasMore }`.
 */
export function usePagedList<T>({ queryKey, path, params, itemsKey, token, enabled = true }: {
  queryKey: unknown[];
  path: string;
  params?: URLSearchParams;
  itemsKey: string;
  token: string | null | undefined;
  enabled?: boolean;
}) {
  const query = useInfiniteQuery({
    queryKey,
    enabled: Boolean(token) && enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const search = new URLSearchParams(params);
      search.set("limit", String(PAGE_SIZE));
      search.set("offset", String(pageParam));
      return api<Record<string, unknown> & { total: number; hasMore: boolean }>(`${path}?${search.toString()}`, { token });
    },
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((sum, page) => sum + (page[itemsKey] as unknown[]).length, 0) : undefined),
  });
  const items = (query.data?.pages ?? []).flatMap((page) => page[itemsKey] as T[]);
  return {
    items,
    total: query.data?.pages[0]?.total ?? 0,
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => void query.fetchNextPage(),
    loadingMore: query.isFetchingNextPage,
    isLoading: query.isLoading,
    query,
  };
}
