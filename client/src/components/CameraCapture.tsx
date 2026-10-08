import { Camera, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";

/** True when the browser can open a live camera (needs HTTPS or localhost). Otherwise use the file input with capture. */
export function canUseLiveCamera() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

const MAX_SIDE = 1920;

/**
 * Live camera in a dialog: shows the preview, every press of the shutter hands one JPEG to onCapture and the dialog stays
 * open so several photos can be taken in a row. Works on desktop browsers too, where `<input capture>` only opens a file picker.
 * When the camera cannot be opened, the dialog says why and offers the normal file picker through onFallback.
 */
export function CameraCapture({
  open,
  onClose,
  onCapture,
  onFallback,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  onFallback?: () => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<"denied" | "unavailable" | null>(null);
  const [ready, setReady] = useState(false);
  const [taken, setTaken] = useState(0);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setTaken(0);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: MAX_SIDE }, height: { ideal: MAX_SIDE } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          void video.play().catch(() => undefined);
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const name = reason instanceof DOMException ? reason.name : "";
        setError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, facing, stop]);

  function shoot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
        setTaken((count) => count + 1);
      },
      "image/jpeg",
      0.85,
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={t("camera.title")}>
      {error ? (
        <div className="space-y-3">
          <p className="text-sm text-neutral-700">{t(error === "denied" ? "camera.denied" : "camera.unavailable")}</p>
          {onFallback ? (
            <button type="button" className="btn-rizo-ghost w-full" onClick={() => { onClose(); onFallback(); }}>
              {t("camera.chooseFile")}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="aspect-[4/3] w-full object-cover"
              onLoadedData={() => setReady(true)}
              aria-label={t("camera.title")}
            />
            {!ready ? <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">{t("camera.starting")}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFacing((current) => (current === "environment" ? "user" : "environment"))}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700"
              aria-label={t("camera.flip")}
              title={t("camera.flip")}
            >
              <RefreshCw size={18} />
            </button>
            <button type="button" disabled={!ready} onClick={shoot} className="btn-rizo flex-1">
              <Camera size={18} />
              {t("common.takePhoto")}
            </button>
            <button type="button" onClick={onClose} className="btn-rizo-ghost">
              {t("common.done")}
              {taken > 0 ? ` (${taken})` : ""}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
