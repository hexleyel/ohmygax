"use client";

/** Rows shown per page wherever a list is paginated. */
export const PAGE_SIZE = 10;

/** Slices a list down to one page, 1-indexed. */
export function pageSlice<T>(items: T[], page: number, size = PAGE_SIZE) {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}

export function pageCount(total: number, size = PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / size));
}

/**
 * Clamps a page number to the pages that actually exist, so removing rows
 * can't strand the view on an empty page past the end.
 */
export function clampPage(page: number, total: number, size = PAGE_SIZE) {
  return Math.min(Math.max(1, page), pageCount(total, size));
}

type Props = {
  page: number;
  total: number;
  size?: number;
  onChange: (page: number) => void;
  /** What is being counted, for the "Showing 1–10 of 23 products" line. */
  label?: string;
  /** Optional page-aware summary for views with custom count wording. */
  summaryText?: (first: number, last: number, total: number) => string;
  /** Hide navigation controls when the entire list fits on one page. */
  hideControlsWhenSinglePage?: boolean;
  /** Larger controls for touch-first screens. */
  largeControls?: boolean;
};

export default function Pagination({
  page,
  total,
  size = PAGE_SIZE,
  onChange,
  label = "items",
  summaryText,
  hideControlsWhenSinglePage = false,
  largeControls = false,
}: Props) {
  const pages = pageCount(total, size);
  if (total === 0) return null;

  const current = clampPage(page, total, size);
  const first = (current - 1) * size + 1;
  const last = Math.min(current * size, total);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className={largeControls ? "text-sm text-slate-500" : "text-xs text-slate-500"}>
        {summaryText ? summaryText(first, last, total) : `Showing ${first}–${last} of ${total} ${label}`}
      </p>

      {!(hideControlsWhenSinglePage && pages <= 1) ? <div className={`flex items-center gap-1 ${largeControls ? "gap-2" : ""}`}>
        <button
          type="button"
          disabled={current <= 1}
          onClick={() => onChange(current - 1)}
          className={`rounded-lg border font-semibold text-slate-600 transition hover:border-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:hover:border-[#e2e8f0] disabled:hover:text-slate-600 ${largeControls ? "min-h-12 px-4 text-sm" : "px-3 py-1 text-xs"}`}
        >
          Previous
        </button>

        {/* Page numbers, windowed so a long list doesn't spill across the row. */}
        {pageNumbers(current, pages).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              aria-current={p === current ? "page" : undefined}
              className={`rounded-lg border font-semibold tabular-nums transition ${largeControls ? "min-h-12 min-w-12 px-3 text-sm" : "min-w-8 px-2 py-1 text-xs"} ${
                p === current
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-[#e2e8f0] text-slate-600 hover:border-blue-600 hover:text-blue-700"
              }`}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          disabled={current >= pages}
          onClick={() => onChange(current + 1)}
          className={`rounded-lg border font-semibold text-slate-600 transition hover:border-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:hover:border-[#e2e8f0] disabled:hover:text-slate-600 ${largeControls ? "min-h-12 px-4 text-sm" : "px-3 py-1 text-xs"}`}
        >
          Next
        </button>
      </div> : null}
    </div>
  );
}

/**
 * First page, last page, and a window around the current one — so 20 pages
 * render as 1 … 8 9 10 … 20 rather than twenty buttons.
 */
function pageNumbers(current: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);

  const out: (number | "gap")[] = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(pages - 1, current + 1);

  if (from > 2) out.push("gap");
  for (let p = from; p <= to; p++) out.push(p);
  if (to < pages - 1) out.push("gap");
  out.push(pages);

  return out;
}
