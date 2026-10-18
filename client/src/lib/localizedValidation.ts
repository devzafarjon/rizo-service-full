import i18n from "i18next";

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isControl(target: EventTarget | null): target is Control {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement
  );
}

/** App-language text for whichever constraint the browser flagged; null when the control is fine. */
function messageFor(control: Control): string | null {
  const t = i18n.t.bind(i18n);
  const state = control.validity;
  const type = control instanceof HTMLInputElement ? control.type : "";
  if (state.valueMissing) {
    if (control instanceof HTMLSelectElement || type === "radio") return t("validation.requiredSelect");
    if (type === "checkbox") return t("validation.requiredCheck");
    if (type === "file") return t("validation.requiredFile");
    return t("validation.required");
  }
  if (state.typeMismatch) {
    if (type === "email") return t("validation.email");
    if (type === "url") return t("validation.url");
    return t("validation.invalid");
  }
  if (state.patternMismatch || state.badInput) return t("validation.invalid");
  if (!(control instanceof HTMLSelectElement)) {
    if (state.tooShort) return t("validation.tooShort", { min: control.minLength });
    if (state.tooLong) return t("validation.tooLong", { max: control.maxLength });
  }
  if (control instanceof HTMLInputElement) {
    if (state.rangeUnderflow) return t("validation.min", { min: control.min });
    if (state.rangeOverflow) return t("validation.max", { max: control.max });
    if (state.stepMismatch) return t("validation.step");
  }
  return null;
}

let installed = false;

/**
 * Browsers word their built-in form bubbles ("Please fill out this field") in the browser's own language, ignoring
 * the app locale. Every form here relies on native validation, so one document-level hook swaps in uz/ru/en text.
 */
export function installLocalizedValidation() {
  if (installed || typeof document === "undefined") return;
  installed = true;

  // `invalid` does not bubble, so it has to be caught while capturing.
  document.addEventListener(
    "invalid",
    (event) => {
      if (!isControl(event.target)) return;
      event.target.setCustomValidity("");
      const message = messageFor(event.target);
      if (message) event.target.setCustomValidity(message);
    },
    true,
  );

  // A custom message keeps the control invalid, so drop it as soon as the value changes...
  const clear = (event: Event) => {
    if (isControl(event.target)) event.target.setCustomValidity("");
  };
  document.addEventListener("input", clear, true);
  document.addEventListener("change", clear, true);

  // ...and before every submit attempt, for values React changed without firing an input event.
  document.addEventListener(
    "click",
    (event) => {
      const button = event.target instanceof Element ? event.target.closest("button, input[type=submit]") : null;
      if (!(button instanceof HTMLButtonElement || button instanceof HTMLInputElement) || button.type !== "submit") return;
      for (const element of Array.from(button.form?.elements ?? [])) {
        if (isControl(element)) element.setCustomValidity("");
      }
    },
    true,
  );
}
