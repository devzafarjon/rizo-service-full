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

// Quick tags: what went wrong for low ratings, what went well for high ones.
const LOW_TAGS = ["late", "not_fixed", "rude", "expensive", "unclear_price"];
const HIGH_TAGS = ["fast", "polite", "clean"];

export function FeedbackForm({ request }: { request: PortalRequest }) {
  const { t } = useTranslation();
  const { token } = useCustomerAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const save = useMutation({
    mutationFn: () =>
      api<{ request: PortalRequest }>(`/api/customer/requests/${request.id}/feedback`, {
        method: "POST",
        token,
        body: JSON.stringify({ rating, comment: comment.trim() || undefined, tags }),
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
        {request.feedback.tags?.length ? (
          <p className="mt-1 text-xs font-semibold text-neutral-600">{request.feedback.tags.map((tag) => t(`feedback.tag.${tag}`)).join(" · ")}</p>
        ) : null}
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
            onClick={() => {
              setRating(value);
              setTags([]);
            }}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl hover:bg-[#FFF4E5]"
            aria-label={value === 1 ? t("feedback.star", { count: value }) : t("feedback.stars", { count: value })}
          >
            <Star size={22} className={value <= rating ? "fill-[#F7941E] text-[#F7941E]" : "text-neutral-300"} />
          </button>
        ))}
      </div>
      {rating > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {(rating <= 3 ? LOW_TAGS : HIGH_TAGS).map((tag) => {
            const on = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => setTags(on ? tags.filter((item) => item !== tag) : [...tags, tag])}
                className={`h-9 rounded-full px-3 text-sm font-bold ${on ? "bg-[#7B00E0] text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
              >
                {t(`feedback.tag.${tag}`)}
              </button>
            );
          })}
        </div>
      ) : null}
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
