import { useState } from "react";
import { useTranslation } from "react-i18next";
import { textareaClass } from "../../components/Field";
import { Spinner } from "../../components/Spinner";
import { formatStamp } from "../../lib/format";
import type { NoteRow } from "../../lib/types";

const TEMPLATES = ["ready", "needParts", "needCall", "bringReceipt"] as const;

/** Internal notes and the message thread with the customer. Messages marked for the customer also go out as a notification / SMS. */
export function NotesPanel({ notes, busy, onSubmit }: { notes: NoteRow[]; busy: boolean; onSubmit: (text: string, visibleToCustomer: boolean) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [visible, setVisible] = useState(true);

  return (
    <div className="space-y-4">
      {notes.length === 0 ? <p className="text-sm text-neutral-500">{t("notes.none")}</p> : null}
      <ul className="space-y-2">
        {notes.map((note) => (
          <li
            key={note.id}
            className={`rounded-2xl px-4 py-3 text-sm ${note.authorScope === "customer" ? "bg-[#FFF4E5]" : note.isVisibleToCustomer ? "bg-[#F5EBFD]" : "bg-neutral-100"}`}
          >
            <p className="whitespace-pre-wrap">{note.text}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {note.authorScope === "customer" ? t("notes.customer") : (note.authorName ?? t("notes.staff"))} · {formatStamp(note.createdAt)} ·{" "}
              {note.authorScope === "customer" ? t("notes.fromCustomer") : note.isVisibleToCustomer ? t("notes.visible") : t("notes.internal")}
            </p>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((key) => (
          <button key={key} type="button" onClick={() => setText(t(`notes.templates.${key}`))} className="h-9 rounded-full bg-neutral-100 px-3 text-xs font-bold text-neutral-700 hover:bg-neutral-200">
            {t(`notes.templateNames.${key}`)}
          </button>
        ))}
      </div>
      <textarea className={textareaClass} value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} placeholder={t("notes.placeholder")} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
          {t("notes.sendToCustomer")}
        </label>
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => {
            onSubmit(text.trim(), visible);
            setText("");
          }}
          className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white hover:bg-[#6500BD] disabled:opacity-50"
        >
          {busy ? <Spinner className="h-4 w-4" /> : null}
          {visible ? t("notes.send") : t("notes.save")}
        </button>
      </div>
    </div>
  );
}
