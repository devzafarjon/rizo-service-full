type RizoLogoProps = {
  className?: string;
};

export function RizoLogo({ className = "h-10 w-auto" }: RizoLogoProps) {
  return <img src="/rizo-logo.svg" alt="RIZO" className={className} />;
}

/** RIZO wordmark with the module name underneath, like RizoPost's "RIZO STORE" lockup. */
export function RizoServiceLockup({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex flex-col items-center leading-none ${className}`}>
      <RizoLogo className="h-11 w-auto" />
      <span className="-mt-2.5 text-[15px] font-black tracking-[0.12em] text-[#F7941E] uppercase italic">Service</span>
    </span>
  );
}
