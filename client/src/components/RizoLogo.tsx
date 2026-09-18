type RizoLogoProps = {
  className?: string;
};

export function RizoLogo({ className = "h-10 w-auto" }: RizoLogoProps) {
  return <img src="/rizo-logo.svg" alt="RIZO" className={className} />;
}
