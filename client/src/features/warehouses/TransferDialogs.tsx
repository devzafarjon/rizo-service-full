import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { api, apiErrorMessage } from "../../lib/api";
import { localizedName } from "../../lib/localized";
import type { SourceOption, SparePart, StockTransfer } from "../../lib/types";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { optionKey, SourcePicker } from "./SourcePicker";

function useRefresh() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ["staff", "transfers"] });
    await queryClient.invalidateQueries({ queryKey: ["staff", "warehouses"] });
    await queryClient.invalidateQueries({ queryKey: ["staff", "part-orders"] });
    await queryClient.invalidateQueries({ queryKey: ["staff", "parts"] });
    await queryClient.invalidateQueries({ queryKey: ["staff", "requests"] });
    await queryClient.invalidateQueries({ queryKey: ["staff", "my-stock"] });
  };
}

function DialogButtons({ onCancel, pending, label, danger = false }: { onCancel: () => void; pending: boolean; label: string; danger?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="h-11 rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
        {t("common.cancel")}
      </button>
      <button type="submit" disabled={pending} className={`inline-flex h-12 items-center gap-2 rounded-lg px-6 text-[12.8px] font-bold text-white disabled:opacity-70 ${danger ? "bg-red-600" : "bg-[#7B00E0]"}`}>
        {pending ? <Spinner className="h-4 w-4" /> : null}
        {label}
      </button>
    </div>
  );
}

/** The source warehouse sends the goods (all, or only some of them) and may promise a date. */
export function ShipDialog({ transfer, onClose }: { transfer: StockTransfer | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const refresh = useRefresh();
  const [quantity, setQuantity] = useState("");
  const [eta, setEta] = useState("");
  useEffect(() => {
    if (transfer) {
      setQuantity(String(transfer.quantity));
      setEta("");
    }
  }, [transfer]);
  const ship = useMutation({
    mutationFn: () => api(`/api/staff/transfers/${transfer!.id}/ship`, { method: "POST", token, body: JSON.stringify({ quantity: Number(quantity), etaAt: eta || null }) }),
    onSuccess: async () => {
      notify(t("warehouse.shipped"));
      await refresh();
      onClose();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  return (
    <Modal open={Boolean(transfer)} onClose={onClose} title={t("warehouse.shipTitle")}>
      {transfer ? (
        <form
          className="space-y-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            ship.mutate();
          }}
        >
          <p className="text-sm font-semibold">
            {localizedName(transfer.part)} · {t("warehouse.asked", { count: transfer.quantity })} → {transfer.to?.name ?? transfer.toTechnician?.name}
          </p>
          <Field label={t("warehouse.sendQty")} hint={t("warehouse.sendQtyHint")}>
            <input className={inputClass} type="number" min={1} max={transfer.quantity} required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </Field>
          <Field label={t("warehouse.etaDate")} hint={t("warehouse.etaHint")}>
            <input className={inputClass} type="date" value={eta} onChange={(event) => setEta(event.target.value)} />
          </Field>
          <DialogButtons onCancel={onClose} pending={ship.isPending} label={t("warehouse.ship")} />
        </form>
      ) : null}
    </Modal>
  );
}

/** The goods are in hand. A smaller quantity can be entered; the rest goes back to the sender. */
export function ReceiveDialog({ transfer, onClose, mine = false }: { transfer: StockTransfer | null; onClose: () => void; mine?: boolean }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const refresh = useRefresh();
  const [quantity, setQuantity] = useState("");
  useEffect(() => {
    if (transfer) setQuantity(String(transfer.quantity));
  }, [transfer]);
  const receive = useMutation({
    mutationFn: () => api(mine ? `/api/staff/my-jobs/transfers/${transfer!.id}/receive` : `/api/staff/transfers/${transfer!.id}/receive`, { method: "POST", token, body: JSON.stringify({ quantity: Number(quantity) }) }),
    onSuccess: async () => {
      notify(t("warehouse.received"));
      await refresh();
      onClose();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  return (
    <Modal open={Boolean(transfer)} onClose={onClose} title={t("warehouse.receiveTitle")}>
      {transfer ? (
        <form
          className="space-y-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            receive.mutate();
          }}
        >
          <p className="text-sm font-semibold">
            {localizedName(transfer.part)} · {t("warehouse.sentQty", { count: transfer.quantity })} · {transfer.from.name}
          </p>
          <Field label={t("warehouse.receivedQty")} hint={t("warehouse.receivedQtyHint")}>
            <input className={inputClass} type="number" min={1} max={transfer.quantity} required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </Field>
          <DialogButtons onCancel={onClose} pending={receive.isPending} label={t("warehouse.receive")} />
        </form>
      ) : null}
    </Modal>
  );
}

export function RejectDialog({ transfer, onClose }: { transfer: StockTransfer | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const refresh = useRefresh();
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (transfer) setReason("");
  }, [transfer]);
  const reject = useMutation({
    mutationFn: () => api(`/api/staff/transfers/${transfer!.id}/reject`, { method: "POST", token, body: JSON.stringify({ reason }) }),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  return (
    <Modal open={Boolean(transfer)} onClose={onClose} title={t("warehouse.rejectTitle")}>
      {transfer ? (
        <form
          className="space-y-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            reject.mutate();
          }}
        >
          <p className="text-sm font-semibold">
            {localizedName(transfer.part)} × {transfer.quantity} · {transfer.requestedBy.name}
          </p>
          <Field label={t("warehouse.rejectReason")} hint={t("warehouse.rejectHint")}>
            <input className={inputClass} required maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <DialogButtons onCancel={onClose} pending={reject.isPending} label={t("warehouse.reject")} danger />
        </form>
      ) : null}
    </Modal>
  );
}

/** Ask for a part for a warehouse: pick the part and quantity, see where it can come from and how fast, choose. */
export function NewRequestDialog({ open, toWarehouseId, initialPartId, onClose }: { open: boolean; toWarehouseId: string; initialPartId?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const refresh = useRefresh();
  const [partId, setPartId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [choice, setChoice] = useState("");
  useEffect(() => {
    if (open) {
      setPartId(initialPartId ?? "");
      setQuantity("1");
      setNote("");
      setChoice("");
    }
  }, [open, initialPartId]);
  const parts = useQuery({ queryKey: ["staff", "parts"], enabled: Boolean(token) && open, queryFn: () => api<{ parts: SparePart[] }>("/api/staff/catalog/parts", { token }) });
  const qty = Math.max(1, Number(quantity) || 1);
  const sources = useQuery({
    queryKey: ["staff", "warehouses", "sources", partId, qty, toWarehouseId],
    enabled: Boolean(token) && open && Boolean(partId),
    queryFn: () => api<{ options: SourceOption[] }>(`/api/staff/warehouses/sources?partId=${partId}&quantity=${qty}&toWarehouseId=${toWarehouseId}`, { token }),
  });
  const options = sources.data?.options ?? [];
  useEffect(() => {
    const best = options.find((option) => option.recommended);
    if (best) setChoice(optionKey(best));
  }, [sources.data]);

  const send = useMutation({
    mutationFn: () => {
      if (choice === "supplier") return api("/api/staff/part-orders", { method: "POST", token, body: JSON.stringify({ sparePartId: partId, quantity: qty, warehouseId: toWarehouseId, note: note || null }) });
      return api("/api/staff/transfers", { method: "POST", token, body: JSON.stringify({ sparePartId: partId, quantity: qty, fromWarehouseId: choice.replace("wh:", ""), toWarehouseId, note: note || null }) });
    },
    onSuccess: async () => {
      notify(choice === "supplier" ? t("parts.orderCreated") : t("warehouse.requestSent"));
      await refresh();
      onClose();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  return (
    <Modal open={open} onClose={onClose} title={t("warehouse.newRequest")}>
      <form
        className="space-y-4"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          send.mutate();
        }}
      >
        <Field label={t("catalog.part")}>
          <select className={`${inputClass} bg-white`} required value={partId} onChange={(event) => setPartId(event.target.value)}>
            <option value="">{t("parts.selectPart")}</option>
            {(parts.data?.parts ?? []).map((part) => (
              <option key={part.id} value={part.id}>
                {localizedName(part)} · {t("common.inStock", { count: part.stockQuantity })}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("common.qty")}>
          <input className={inputClass} type="number" min={1} required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </Field>
        {partId ? (
          <div>
            <p className="mb-2 text-xs font-bold tracking-wide text-neutral-500 uppercase">{t("warehouse.source.title")}</p>
            {sources.isLoading ? <Spinner className="h-5 w-5" /> : <SourcePicker options={options} value={choice} onChange={(key) => setChoice(key)} />}
          </div>
        ) : null}
        <Field label={t("payments.note")}>
          <input className={inputClass} maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={send.isPending || !partId || !choice} className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white disabled:opacity-70">
            {send.isPending ? <Spinner className="h-4 w-4" /> : null}
            {t("warehouse.ask")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
