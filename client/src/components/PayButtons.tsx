import { useTranslation } from "react-i18next";
import type { PayLinks } from "../lib/types";

// Letter marks in each provider's colour (not their official logos).
const MARKS = {
  payme: { color: "#00B8B8", label: "payme" },
  click: { color: "#0A9BE6", label: "click" },
} as const;

export function PayMark({ provider, size = 28 }: { provider: "payme" | "click"; size?: number }) {
  const mark = MARKS[provider];
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
      <rect width="28" height="28" rx="7" fill={mark.color} />
      <text x="14" y="18.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff" fontFamily="Nunito Sans, system-ui, sans-serif">
        {provider === "payme" ? "P" : "C"}
      </text>
    </svg>
  );
}

/** Payme and Click buttons with their marks; until the merchant ids are set they open the provider's own site. */
export function PayButtons({ links, compact }: { links: PayLinks; compact?: boolean }) {
  const { t } = useTranslation();
  const height = compact ? "h-10" : "h-11";
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(["payme", "click"] as const).map((provider) =>
          links[provider] ? (
            <a
              key={provider}
              href={links[provider]}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex ${height} items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-bold text-neutral-800 hover:border-[#7B00E0]`}
            >
              <PayMark provider={provider} size={compact ? 22 : 26} />
              {MARKS[provider].label === "payme" ? "Payme" : "Click"}
            </a>
          ) : null,
        )}
      </div>
      {links.placeholder ? <p className="mt-2 text-xs text-neutral-500">{t("pay.placeholder")}</p> : null}
    </>
  );
}
