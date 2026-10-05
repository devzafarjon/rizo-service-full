import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { inputClass } from "./Field";

// RizoPost sign-in field: leading icon, and a show/hide toggle for passwords.
export function AuthInput({ icon: Icon, type, ...props }: { icon: LucideIcon } & InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="relative">
      <Icon size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-700" />
      <input {...props} type={isPassword && visible ? "text" : type} className={`${inputClass} pl-10 ${isPassword ? "pr-11" : ""}`} />
      {isPassword ? (
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
          className="absolute top-1/2 right-2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-800 hover:bg-gray-100"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      ) : null}
    </div>
  );
}
