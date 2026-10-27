import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { verifyJwt } from "@/lib/auth";
import type { SessionUser } from "@/context/SessionContext";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OHMYGAS",
  description: "LPG store POS and inventory management dashboard",
};

/**
 * Reads the session cookie on the server so the shell renders with the logged-in
 * user already known. Without this the user menu/logout only appears after a
 * client-side session fetch resolves, which flickers on load.
 */
async function getInitialUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get("ohmygas_session")?.value;
  if (!token) return null;

  try {
    const payload = verifyJwt(token);
    return {
      user_id: payload.user_id,
      username: payload.username,
      full_name: payload.full_name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initialUser = await getInitialUser();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#f1f5f9] text-slate-900">
        <AppShell initialUser={initialUser}>{children}</AppShell>
      </body>
    </html>
  );
}
