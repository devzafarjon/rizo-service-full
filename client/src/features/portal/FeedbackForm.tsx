import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { useCustomerAuth } from "../auth/CustomerAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { portalTextareaClass } from "./fields";
import type { PortalRequest } from "../../lib/types";

export function FeedbackForm({ request }: { request: PortalRequest }) {
  const { t } = useTranslation();
  const { token } = useCustomerAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api<{ request: PortalRequest }>(`/api/customer/requests/${request.id}/feedback`, {
        method: "POST",
        token,
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      }),
    onSuccess: async () => {
      notify(t("feedback.thanks"));
      await queryClient.invalidateQueries({ queryKey: ["customer"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  if (request.feedback) {
    return (
      <div className="rounded-2xl bg-[#FFF4E5] px-4 py-3">
        <p className="text-sm font-bold text-[#C56A00]">{t("feedback.rated", { rating: request.feedback.rating })}</p>
        {request.feedback.comment ? <p className="mt-1 text-sm text-neutral-700">{request.feedback.comment}</p> : null}
      </div>
    );
  }

  if (!request.canFeedback) {
    return null;
  }

  return (
    <form
      className="rounded-2xl border border-neutral-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (rating < 1) return;
        save.mutate();
      }}
    >
      <p className="text-sm font-extrabold text-neutral-900">{t("feedback.title")}</p>
      <p className="mt-1 text-xs text-neutral-500">{t("feedback.hint")}</p>
      <div className="mt-3 flex gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setRating(value)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl hover:bg-[#FFF4E5]"
            aria-label={value === 1 ? t("feedback.star", { count: value }) : t("feedback.stars", { count: value })}
          >
            <Star size={22} className={value <= rating ? "fill-[#F6921E] text-[#F6921E]" : "text-neutral-300"} />
          </button>
        ))}
      </div>
      <textarea
        className={`${portalTextareaClass} mt-3 min-h-20`}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder={t("feedback.comment")}
        maxLength={500}
      />
      <button
        type="submit"
        disabled={save.isPending || rating < 1}
        className="btn-rizo-sm mt-3 w-full disabled:opacity-50"
      >
        {save.isPending ? <Spinner className="h-4 w-4" /> : null}
        {t("feedback.send")}
      </button>
    </form>
  );
}
