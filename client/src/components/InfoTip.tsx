import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";

export function InfoTip({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <Popover className="relative inline-flex">
      <PopoverButton
        type="button"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-[#B439FD] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B439FD]"
        aria-label={t("common.moreInfo")}
        onClick={(event) => event.stopPropagation()}
      >
        <Info size={14} />
      </PopoverButton>
      <PopoverPanel
        anchor="top start"
        className="z-[90] w-[min(calc(100vw-2rem),16rem)] rounded-xl bg-white p-3 text-xs leading-relaxed font-medium text-neutral-600 shadow-lg ring-1 ring-neutral-200"
      >
        {text}
      </PopoverPanel>
    </Popover>
  );
}
