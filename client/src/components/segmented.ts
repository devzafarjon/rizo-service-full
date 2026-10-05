// RizoPost segmented control: light gray rail, active option is a solid brand-purple tab.
export const segmentedGroupClass = "inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-gray-200 bg-[#F1F5F9] p-1";

export function segmentedItemClass(active: boolean, size: "md" | "sm" = "md") {
  const height = size === "sm" ? "h-8 px-3 text-[13px]" : "h-[42px] px-4 text-sm";
  return `inline-flex ${height} items-center justify-center whitespace-nowrap rounded-lg border transition ${
    active
      ? "border-[#7B00E0] bg-[#7B00E0] font-semibold text-white shadow-[0_1px_3px_rgba(123,0,224,0.3)]"
      : "border-transparent font-medium text-[#475569] hover:text-[#7B00E0]"
  }`;
}

/** Same look for Headless UI <Tab>, which exposes the selected state as data-selected. */
export const segmentedTabClass =
  "inline-flex h-[42px] items-center justify-center whitespace-nowrap rounded-lg border border-transparent px-4 text-sm font-medium text-[#475569] outline-none transition hover:text-[#7B00E0] data-selected:border-[#7B00E0] data-selected:bg-[#7B00E0] data-selected:font-semibold data-selected:text-white data-selected:shadow-[0_1px_3px_rgba(123,0,224,0.3)]";
