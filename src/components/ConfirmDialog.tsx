"use client";

import type { ReactNode } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  size?: "sm" | "md" | "lg";
  confirmDisabled?: boolean;
  busy?: boolean;
  onClose?: () => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Yes",
  cancelLabel = "No",
  tone = "primary",
  size = "sm",
  confirmDisabled = false,
  busy = false,
  onClose,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${size === "lg" ? "max-w-2xl max-h-[90vh] overflow-y-auto" : size === "md" ? "max-w-lg" : "max-w-sm"} rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-xl`}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {onClose ? (
            <button
              type="button"
              aria-label="Close dialog"
              onClick={onClose}
              disabled={busy}
              className="-mr-2 -mt-2 flex h-12 w-12 items-center justify-center rounded-lg text-3xl leading-none text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
            >
              ×
            </button>
          ) : null}
        </div>
        {message ? (
          <div className="mt-2 text-sm text-slate-500">{message}</div>
        ) : null}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            className={`min-h-12 flex-1 rounded-lg px-5 py-3 text-base font-bold text-white transition disabled:opacity-60 ${
              tone === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-12 flex-1 rounded-lg border border-[#e2e8f0] px-5 py-3 text-base font-semibold text-slate-600 transition hover:border-slate-400 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
