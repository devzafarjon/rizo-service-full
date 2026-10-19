import type { ComponentType, ReactNode } from "react";
import { homePathFor } from "../../lib/home";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Check,
  CalendarCheck,
  Eye,
  Languages,
  Lock,
  MapPin,
  MessageCircle,
  PackageCheck,
  ReceiptText,
  Search,
  ShieldCheck,
  Smartphone,
  Truck,
  Wrench,
} from "lucide-react";
import { BrandChrome } from "../../components/BrandChrome";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useCustomerAuth } from "./CustomerAuthContext";
import { useStaffAuth } from "./StaffAuthContext";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const SERVICES: { key: "install" | "repair" | "warranty"; icon: Icon }[] = [
  { key: "install", icon: PackageCheck },
  { key: "repair", icon: Wrench },
  { key: "warranty", icon: ShieldCheck },
];

const STEPS = ["step1", "step2", "step3", "step4"] as const;

const WHY: { key: "track" | "clear" | "estimate" | "telegram" | "languages" | "privacy"; icon: Icon }[] = [
  { key: "track", icon: Search },
  { key: "clear", icon: Eye },
  { key: "estimate", icon: ReceiptText },
  { key: "telegram", icon: MessageCircle },
  { key: "languages", icon: Languages },
  { key: "privacy", icon: Lock },
];

function SectionHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-2xl font-bold tracking-tight text-[#141824] sm:text-3xl">{title}</h2>
      <p className="mt-3 text-sm text-[#475569] sm:text-base">{subtitle}</p>
    </div>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">{children}</section>;
}

/** A static, clearly-labelled sample of what the customer sees after sending a request. */
function SampleRequestCard() {
  const { t } = useTranslation();
  const stages = ["new", "in_progress", "completed"] as const;
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-[#F5EBFD] opacity-70 blur-2xl" aria-hidden />
      <div className="rounded-2xl border border-[#F2F3F7] bg-white p-5 shadow-[0_20px_50px_-20px_rgba(123,0,224,0.35)] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{t("home.mock.caption")}</span>
          <span className="rounded-full bg-[#F5EBFD] px-2.5 py-1 text-xs font-bold text-[#7B00E0]">{t("type.installation")}</span>
        </div>
        <h3 className="mt-3 text-lg font-bold text-[#141824]">{t("home.mock.heading")}</h3>
        <p className="mt-1 text-sm text-[#475569]">
          {t("home.mock.number")} · {t("home.mock.product")}
        </p>

        <ol className="mt-5 space-y-0">
          {stages.map((s, i) => {
            const done = i === 0;
            const current = i === 1;
            return (
              <li key={s} className="relative flex items-center gap-3 pb-5 last:pb-0">
                {i < stages.length - 1 ? (
                  <span
                    className={`absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-0.5 ${done ? "bg-[#7B00E0]" : "bg-[#E0CDF2]"}`}
                    aria-hidden
                  />
                ) : null}
                <span
                  className={`relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    done
                      ? "bg-[#7B00E0] text-white"
                      : current
                        ? "border-2 border-[#7B00E0] bg-white text-[#7B00E0]"
                        : "border-2 border-[#E0CDF2] bg-white text-gray-400"
                  }`}
                >
                  {done ? <Check className="size-4" aria-hidden /> : i + 1}
                </span>
                <span className={`text-sm font-semibold ${current ? "text-[#7B00E0]" : done ? "text-[#141824]" : "text-gray-400"}`}>
                  {t(`customerStatus.${s}`)}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="mt-5 flex items-center gap-3 rounded-xl bg-[#FFF4E5] p-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[#F7941E]">
            <Truck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#8A4B00]">{t("home.mock.technician")}</p>
            <p className="text-xs text-[#C56A00]">{t("home.mock.arrival")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  const { user: staff, loading: staffLoading } = useStaffAuth();
  const { user: customer, loading: customerLoading } = useCustomerAuth();

  if (staffLoading || customerLoading) {
    return (
      <div className="min-h-dvh bg-[#FAFAFA] p-6">
        <PageSkeleton />
      </div>
    );
  }
  // A remembered session goes straight to its own home instead of the marketing page.
  if (staff) return <Navigate to={homePathFor(staff.role)} replace />;
  if (customer) return <Navigate to="/portal" replace />;

  return (
    <BrandChrome
      variant="landing"
      action={
        <Link to="/login" className="btn-rizo-ghost h-11">
          {t("common.signIn")}
        </Link>
      }
    >
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-[#F5EBFD] opacity-80 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -left-24 top-48 size-72 rounded-full bg-[#FFF4E5] opacity-80 blur-3xl" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#F5EBFD] px-3 py-1.5 text-xs font-bold text-[#7B00E0] sm:text-sm">
              <Wrench className="size-4" aria-hidden />
              {t("home.hero.badge")}
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-[#141824] sm:text-5xl sm:leading-[1.08] lg:text-6xl lg:leading-[1.05]">
              {t("home.hero.title")} <span className="text-[#7B00E0]">{t("home.hero.titleAccent")}</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-[#475569] sm:text-lg lg:mx-0">{t("home.hero.subtitle")}</p>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Link to="/login" className="btn-rizo">
                {t("common.signIn")}
              </Link>
              <Link to="/portal/signup" className="btn-rizo-orange">
                {t("auth.createAccount")}
              </Link>
            </div>
            <p className="mt-5 text-sm text-[#475569]">
              <Link to="/track" className="inline-flex items-center gap-1.5 font-bold text-[#7B00E0] hover:underline">
                {t("home.track")}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <span className="mt-1 block text-gray-500 sm:mt-0 sm:ml-2 sm:inline">{t("home.hero.noAccount")}</span>
            </p>
          </div>
          <SampleRequestCard />
        </div>
      </section>

      {/* Services */}
      <Section>
        <SectionHead title={t("home.services.title")} subtitle={t("home.services.subtitle")} />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {SERVICES.map(({ key, icon: Icon }) => (
            <div key={key} className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
              <span className="flex size-12 items-center justify-center rounded-xl bg-[#F5EBFD] text-[#7B00E0]">
                <Icon className="size-6" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-bold text-[#141824]">{t(`home.services.${key}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#475569]">{t(`home.services.${key}.text`)}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section>
        <SectionHead title={t("home.how.title")} subtitle={t("home.how.subtitle")} />
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s} className="rounded-2xl border border-neutral-200 bg-white p-5">
              <span className="flex size-9 items-center justify-center rounded-full bg-[#7B00E0] text-sm font-bold text-white">{i + 1}</span>
              <h3 className="mt-4 text-base font-bold text-[#141824]">{t(`home.how.${s}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#475569]">{t(`home.how.${s}.text`)}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Why RIZO */}
      <Section>
        <SectionHead title={t("home.why.title")} subtitle={t("home.why.subtitle")} />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WHY.map(({ key, icon: Icon }) => (
            <div key={key} className="flex gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF4E5] text-[#F7941E]">
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[#141824]">{t(`home.why.${key}.title`)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#475569]">{t(`home.why.${key}.text`)}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Portal and apps */}
      <Section>
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#7B00E0] to-[#4B0089] p-6 text-white sm:p-10 lg:p-12">
          <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(255,255,255,0.15)] px-3 py-1.5 text-xs font-bold sm:text-sm">
                <Smartphone className="size-4" aria-hidden />
                {t("home.portal.badge")}
              </span>
              <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{t("home.portal.title")}</h2>
              <p className="mt-3 max-w-xl text-sm text-white/85 sm:text-base">{t("home.portal.text")}</p>
              <ul className="mt-5 space-y-2.5">
                {(["li1", "li2", "li3", "li4"] as const).map((k) => (
                  <li key={k} className="flex items-start gap-2.5 text-sm text-white/95">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,0.2)]">
                      <Check className="size-3.5" aria-hidden />
                    </span>
                    {t(`home.portal.${k}`)}
                  </li>
                ))}
              </ul>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/portal/signup"
                  className="inline-flex h-12 items-center justify-center rounded-md bg-[#ffffff] px-6 text-base font-bold !text-[#7B00E0] hover:bg-[#F5EBFD]"
                >
                  {t("auth.createAccount")}
                </Link>
                <Link
                  to="/login"
                  className="inline-flex h-12 items-center justify-center rounded-md border border-white/60 px-6 text-base font-bold text-white hover:bg-[rgba(255,255,255,0.1)]"
                >
                  {t("common.signIn")}
                </Link>
              </div>
            </div>
            <div className="hidden justify-center lg:flex">
              <div className="flex size-48 items-center justify-center rounded-[2.5rem] bg-[rgba(255,255,255,0.1)]">
                <CalendarCheck className="size-24 text-white/90" aria-hidden />
              </div>
            </div>
          </div>
          <p className="mt-8 border-t border-white/20 pt-5 text-xs text-white/75 sm:text-sm">{t("home.portal.staff")}</p>
        </div>
      </Section>

      {/* Service centers teaser */}
      <Section>
        <div className="flex flex-col items-start gap-5 rounded-2xl border border-neutral-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#F5EBFD] text-[#7B00E0]">
              <MapPin className="size-6" aria-hidden />
            </span>
            <div>
              <h2 className="text-xl font-bold text-[#141824]">{t("home.centersBlock.title")}</h2>
              <p className="mt-1 text-sm text-[#475569]">{t("home.centersBlock.text")}</p>
            </div>
          </div>
          <Link to="/centers" className="btn-rizo-ghost shrink-0">
            {t("home.centers")}
          </Link>
        </div>
      </Section>

      {/* Final call to action */}
      <Section>
        <div className="mx-auto max-w-2xl pb-6 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-[#141824] sm:text-3xl">{t("home.cta.title")}</h2>
          <p className="mt-3 text-sm text-[#475569] sm:text-base">{t("home.cta.text")}</p>
          <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
            <Link to="/portal/signup" className="btn-rizo-orange">
              {t("auth.createAccount")}
            </Link>
            <Link to="/track" className="btn-rizo-ghost">
              {t("home.track")}
            </Link>
          </div>
        </div>
      </Section>
    </BrandChrome>
  );
}
