import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "../i18n";

/** Keeps one broken screen from blanking the whole app; resets when the route changes. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ui]", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-extrabold text-neutral-900">{i18n.t("errorBoundary.title")}</h1>
        <p className="text-sm text-neutral-600">{i18n.t("errorBoundary.body")}</p>
        <button type="button" onClick={() => window.location.reload()} className="btn-rizo">
          {i18n.t("errorBoundary.reload")}
        </button>
      </div>
    );
  }
}
