/**
 * Paging for list endpoints. A caller that sends `limit` (and `offset`) gets exactly that window; a caller that sends nothing
 * (calendar, map, receipts, the apps) still gets everything up to `cap`, so no list is ever unbounded. Every list reply also
 * carries `total`, so the screen can say how many exist and whether there is more.
 */
export const MAX_PAGE = 200;

export function parsePaging(query: { limit?: unknown; offset?: unknown }, cap: number) {
  const limit = Number(query.limit);
  const offset = Number(query.offset);
  const paged = Number.isFinite(limit) && limit >= 1;
  return {
    take: paged ? Math.min(Math.floor(limit), MAX_PAGE) : cap,
    skip: Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0,
  };
}

export function pageInfo(total: number, skip: number, returned: number) {
  return { total, hasMore: skip + returned < total };
}
