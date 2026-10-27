"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { SessionProvider, type SessionUser } from "@/context/SessionContext";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import LogoutConfirm from "@/components/LogoutConfirm";

const CHROME_LESS_PATHS = ["/login", "/two-factor-authentication"];

export default function AppShell({
  children,
  initialUser = null,
}: {
  children: ReactNode;
  initialUser?: SessionUser | null;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isChromeLess = CHROME_LESS_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  // Close the mobile drawer whenever we navigate to a new page.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <SessionProvider initialUser={initialUser}>
      <LogoutConfirm />
      {isChromeLess ? (
        children
      ) : (
        <div className="flex min-h-screen">
          <Sidebar
            mobileOpen={mobileNavOpen}
            onClose={() => setMobileNavOpen(false)}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar onMenuClick={() => setMobileNavOpen(true)} />
            <main className="flex-1">{children}</main>
          </div>
        </div>
      )}
    </SessionProvider>
  );
}
