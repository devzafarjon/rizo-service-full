import { useTranslation } from "react-i18next";
import { Spinner } from "./Spinner";

/** Under a paged list: how many of the total are shown, and a button for the next page. */
export function LoadMore({ shown, total, hasMore, loading, onMore }: { shown: number; total: number; hasMore: boolean; loading: boolean; onMore: () => void }) {
  const { t } = useTranslation();
  if (total === 0) return null;
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <p className="text-xs text-neutral-500">{t("common.shownOf", { shown, total })}</p>
      {hasMore ? (
        <button type="button" onClick={onMore} disabled={loading} className="btn-rizo-ghost">
          {loading ? <Spinner className="h-4 w-4" /> : null}
          {t("common.loadMore")}
        </button>
      ) : null}
    </div>
  );
}
