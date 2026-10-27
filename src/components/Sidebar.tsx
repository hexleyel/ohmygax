"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  SIDEBAR_NAV,
  type SidebarGroupItem,
} from "@/components/sidebarConfig";
import { useSession } from "@/context/SessionContext";

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type SidebarProps = {
  mobileOpen?: boolean;
  onClose?: () => void;
};

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, requestLogout } = useSession();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );

  const visibleNav = useMemo(() => {
    const isAdmin = user?.role === "admin";
    return (
      SIDEBAR_NAV
        // Admin-only entries, whether a top-level link or a whole group.
        .filter((item) => (item.adminOnly ? isAdmin : true))
        // Admin-only links nested inside a group are filtered too — otherwise a
        // group child's adminOnly flag is silently ignored.
        .map((item) =>
          item.type === "group"
            ? {
                ...item,
                items: item.items.filter((child) =>
                  child.adminOnly ? isAdmin : true,
                ),
              }
            : item,
        )
        // Drop a group that has nothing left to show.
        .filter((item) => item.type !== "group" || item.items.length > 0)
    );
  }, [user]);

  const toggleGroup = (label: string) => {
    setExpandedGroups((current) => ({ ...current, [label]: !current[label] }));
  };

  return (
    <>
      {/* Backdrop for the mobile drawer */}
      {mobileOpen ? (
        <div
          onClick={onClose}
          aria-hidden
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      ) : null}

      {/*
        Below lg this is an off-canvas drawer (so small screens still have
        navigation at all). From lg up it is a sticky full-height column, so
        the nav and the logout button never scroll out of reach.
      */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-y-auto border-r border-[#e2e8f0] bg-[#ffffff] p-6 transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 p-2 text-white shadow-sm">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <rect x="6" y="7" width="12" height="14" rx="3" />
                <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
                <path d="M10 3h4" />
                <line x1="6" y1="12" x2="18" y2="12" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                OHMYGAS
              </p>
              <p className="truncate text-xs text-slate-500">Island Gas LPG</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="rounded-md border border-[#e2e8f0] px-2 py-1 text-xs text-slate-500 lg:hidden"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 space-y-2">
          {visibleNav.map((item) => {
            if (item.type === "link") {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm transition ${
                    isActivePath(pathname, item.href)
                      ? "bg-blue-600/10 text-blue-600"
                      : "text-slate-600 hover:bg-blue-600/10 hover:text-blue-600"
                  }`}
                >
                  {item.label}
                </Link>
              );
            }

            const group = item as SidebarGroupItem;
            const isOpen =
              expandedGroups[group.label] ??
              group.items.some((child) => isActivePath(pathname, child.href));

            return (
              <div key={group.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold uppercase tracking-[0.2em] text-slate-600 transition hover:bg-blue-600/10 hover:text-blue-600"
                >
                  <span>{group.label}</span>
                  <span className="text-xs">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen ? (
                  <div className="mt-1 space-y-1 pl-4">
                    {group.items.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`block rounded-lg px-3 py-2 text-sm transition ${
                          isActivePath(pathname, child.href)
                            ? "bg-blue-600/10 text-blue-600"
                            : "text-slate-500 hover:bg-blue-600/10 hover:text-blue-600"
                        }`}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        {user ? (
          <div className="mt-6 shrink-0 border-t border-[#e2e8f0] pt-4">
            <p className="mb-2 truncate text-xs text-slate-500">
              Signed in as <span className="text-slate-600">{user.full_name}</span>
            </p>
            <button
              type="button"
              onClick={requestLogout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-red-500/10 hover:text-red-600"
            >
              <span aria-hidden>⏻</span>
              Logout
            </button>
          </div>
        ) : null}
      </aside>
    </>
  );
}
