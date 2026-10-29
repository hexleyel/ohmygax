type StatusFilter = "all" | "issued" | "pending" | "back-order" | "received" | "cancelled";

export const PURCHASE_ORDER_STATUS_FILTERS: StatusFilter[] = [
  "all",
  "issued",
  "pending",
  "back-order",
  "received",
  "cancelled",
];
export const RECEIVE_ORDER_STATUS_FILTERS: StatusFilter[] = [
  "all",
  "pending",
  "back-order",
  "received",
];

export const PURCHASE_ORDER_STATUS_LABELS: Record<StatusFilter, string> = {
  all: "ALL",
  issued: "ISSUED",
  pending: "PENDING",
  "back-order": "BACK ORDER",
  received: "COMPLETED",
  cancelled: "CANCELLED",
};

export type PurchaseOrderStatusFilter = StatusFilter;
export type PurchaseOrderStatusCounts = Record<StatusFilter, number>;

export function PurchaseOrderStatusTabs({
  value,
  counts,
  onChange,
  filters = PURCHASE_ORDER_STATUS_FILTERS,
}: {
  value: PurchaseOrderStatusFilter;
  counts: PurchaseOrderStatusCounts;
  onChange: (status: PurchaseOrderStatusFilter) => void;
  filters?: readonly PurchaseOrderStatusFilter[];
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {filters.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => onChange(status)}
          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase transition ${
            value === status
              ? status === "issued"
                ? "border-slate-400 bg-transparent text-slate-700"
                : "border-blue-600 bg-blue-600/10 text-blue-700"
              : status === "issued"
                ? "border-slate-300 bg-transparent text-slate-600 hover:border-slate-500 hover:text-slate-800"
                : "border-[#e2e8f0] text-slate-500 hover:border-blue-600"
          }`}
        >
          {PURCHASE_ORDER_STATUS_LABELS[status]}
          {counts[status] > 0 ? (
            <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-slate-600">
              {counts[status]}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function PurchaseOrderStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-500/15 text-emerald-700",
    complete: "bg-emerald-500/15 text-emerald-700",
    received: "bg-emerald-500/15 text-emerald-700",
    issued: "bg-amber-100 text-amber-800",
    pending: "bg-blue-500/15 text-blue-700",
    "to-receive": "bg-amber-500/15 text-amber-700",
    "back-order": "bg-orange-500/15 text-orange-700",
    cancelled: "bg-slate-400/20 text-slate-600",
  };

  const label = status === "received" || status === "completed"
    ? "COMPLETED"
    : status === "back-order"
      ? "Back Order"
      : status === "to-receive"
        ? "To receive"
        : status;

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
        styles[status] ?? "bg-slate-400/20 text-slate-600"
      }`}
    >
      {label}
    </span>
  );
}
