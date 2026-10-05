export type StatAccent = "purple" | "green" | "red" | "orange";

const ACCENT_BORDER: Record<StatAccent, string> = {
  purple: "border-l-[#7B00E0]",
  green: "border-l-[#25B003]",
  red: "border-l-[#EC1F00]",
  orange: "border-l-[#F7941E]",
};

// RizoPost stat tile: white card, colored left edge, uppercase label, large purple value.
export function StatCard({ label, value, accent = "purple" }: { label: string; value: string; accent?: StatAccent }) {
  return (
    <div className={`rounded-2xl border border-l-4 border-gray-200 bg-white px-5 py-4 shadow-sm ${ACCENT_BORDER[accent]}`}>
      <p className="text-[13px] font-semibold tracking-wide text-gray-600 uppercase">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-[#5A0085] tabular-nums">{value}</p>
    </div>
  );
}
