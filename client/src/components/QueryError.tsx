import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApiError, apiErrorMessage } from "../lib/api";
import { EmptyState } from "./EmptyState";

/** A failed fetch with nothing cached to show: says what went wrong and offers a retry (a 404 is "not found", not retryable). */
export function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <EmptyState
      tone="error"
      title={notFound ? t("common.notFoundTitle") : t("common.loadFailed")}
      body={apiErrorMessage(error, t)}
      action={
        onRetry && !notFound ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white"
          >
            <RefreshCw size={16} />
            {t("common.retry")}
          </button>
        ) : undefined
      }
    />
  );
}
