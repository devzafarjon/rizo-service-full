import { useEffect, useRef, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";

export function SignaturePad({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    if (value) {
      const image = new Image();
      image.onload = () => ctx.drawImage(image, 0, 0, width, height);
      image.src = value;
    } else {
      ctx.clearRect(0, 0, width, height);
    }
  }, [value]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = point(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(event.currentTarget.toDataURL("image/png"));
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="h-36 w-full touch-none rounded-xl bg-neutral-50 ring-1 ring-neutral-200"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <button
        type="button"
        disabled={disabled || !value}
        onClick={() => onChange(null)}
        className="mt-2 text-xs font-bold text-neutral-500 hover:text-[#B439FD] disabled:opacity-40"
      >
        {t("pickup.clearSignature")}
      </button>
    </div>
  );
}
