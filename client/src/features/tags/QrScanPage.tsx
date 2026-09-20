import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { inputClass } from "../../components/Field";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { parseRequestTag } from "../../lib/qrTag";
import type { ServiceRequest } from "../../lib/types";

type Scanner = {
  start: (
    camera: { facingMode: string },
    config: { fps: number; qrbox: { width: number; height: number } },
    onSuccess: (text: string) => void,
    onFailure?: (error: string) => void,
  ) => Promise<void>;
  stop: () => Promise<void>;
};

function loadScannerLib() {
  return new Promise<new (id: string) => Scanner>((resolve, reject) => {
    const existing = (window as Window & { Html5Qrcode?: new (id: string) => Scanner }).Html5Qrcode;
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement("script");
    script.src = "/html5-qrcode.min.js";
    script.async = true;
    script.onload = () => {
      const ctor = (window as Window & { Html5Qrcode?: new (id: string) => Scanner }).Html5Qrcode;
      if (ctor) resolve(ctor);
      else reject(new Error("scanner missing"));
    };
    script.onerror = () => reject(new Error("scanner failed"));
    document.head.appendChild(script);
  });
}

export function QrScanPage() {
  const { t } = useTranslation();
  const { token, user } = useStaffAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const hostId = "rizo-qr-reader";
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);

  async function openRequest(raw: string) {
    const displayId = parseRequestTag(raw);
    if (!displayId || !token) {
      notify(t("tag.invalid"), "error");
      return;
    }
    setBusy(true);
    try {
      if (stopRef.current) {
        await stopRef.current().catch(() => undefined);
        stopRef.current = null;
      }
      const data = await api<{ request: ServiceRequest; ownedByMe: boolean }>(`/api/staff/tags/${encodeURIComponent(displayId)}`, {
        token,
      });
      if (user?.role === "technician") {
        navigate(data.ownedByMe ? `/app/my-jobs/${data.request.id}/complete` : `/app/tag/${data.request.displayId}`, {
          replace: true,
        });
        return;
      }
      navigate(`/app/requests/${data.request.id}`, { replace: true });
    } catch (error) {
      notify(apiErrorMessage(error, t), "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void loadScannerLib()
      .then((Html5Qrcode) => {
        if (cancelled || !document.getElementById(hostId)) return;
        const scanner = new Html5Qrcode(hostId);
        stopRef.current = () => scanner.stop();
        return scanner.start({ facingMode: "environment" }, { fps: 8, qrbox: { width: 240, height: 240 } }, (text) => {
          void openRequest(text);
        });
      })
      .catch(() => {
        if (!cancelled) notify(t("tag.cameraDenied"), "error");
      });
    return () => {
      cancelled = true;
      void stopRef.current?.().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">{t("tag.scanTitle")}</h1>
      <p className="mt-1 mb-4 text-sm text-neutral-500">{t("tag.scanHint")}</p>
      <div id={hostId} className="mx-auto min-h-64 max-w-sm overflow-hidden rounded-2xl bg-black" />
      <form
        className="mx-auto mt-6 flex max-w-sm gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void openRequest(manual);
        }}
      >
        <input className={inputClass} value={manual} onChange={(event) => setManual(event.target.value)} placeholder={t("tag.manualPlaceholder")} />
        <button type="submit" disabled={busy} className="h-11 shrink-0 rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white">
          {t("tag.open")}
        </button>
      </form>
    </div>
  );
}
