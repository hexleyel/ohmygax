"use client";

import { useSession } from "@/context/SessionContext";
import { useEffect, useState } from "react";

export default function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user } = useSession();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const intervalId = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const dateTime = now
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(now).replace(/, (?=\d{1,2}:\d{2}:\d{2})/, " " + String.fromCharCode(183) + " ")
    : "";

  return (
    // Keep the dashboard header visible while the page below it is scrolled.
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#e2e8f0] bg-[#ffffff] px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm text-slate-600 transition hover:border-blue-600 hover:text-blue-700 lg:hidden"
        >
          ☰
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
            OHMYGAS
          </p>
          <p className="truncate text-xs text-slate-500">Island Gas LPG Store</p>
        </div>
      </div>

      {user ? (
        <div className="flex shrink-0 items-center gap-3">
          <time
            dateTime={now?.toISOString()}
            className="whitespace-nowrap text-right text-[9px] font-medium text-slate-500 sm:text-xs"
          >
            {dateTime}
          </time>
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-slate-900">{user.full_name}</p>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                user.role === "admin"
                  ? "bg-blue-600/15 text-blue-700"
                  : "bg-sky-500/15 text-sky-700"
              }`}
            >
              {user.role}
            </span>
          </div>
        </div>
      ) : null}
    </header>
  );
}
