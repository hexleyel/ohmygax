"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSession } from "@/context/SessionContext";
import { getCashSessionStatus } from "@/utils/api-services/cashSessionService";

/** Single logout confirmation shared by the topbar and sidebar buttons. */
export default function LogoutConfirm() {
  const { logoutPending, logout, cancelLogout, user } = useSession();
  const router = useRouter();
  const [checkingShift, setCheckingShift] = useState(false);
  const [shiftAlertOpen, setShiftAlertOpen] = useState(false);
  const [checkError, setCheckError] = useState("");

  async function confirmLogout() {
    setCheckingShift(true);
    setCheckError("");
    try {
      const { openSession } = await getCashSessionStatus();
      if (openSession) {
        cancelLogout();
        setShiftAlertOpen(true);
        return;
      }
      await logout();
    } catch (error) {
      setCheckError(error instanceof Error ? error.message : "Could not verify the active cash shift.");
    } finally {
      setCheckingShift(false);
    }
  }

  return (
    <>
    <ConfirmDialog
      open={logoutPending}
      title="Log out?"
      message={
        user ? (
          <span>
            You are signed in as{" "}
            <strong className="text-slate-900">{user.full_name}</strong>. Any
            unsaved work on this screen will be lost.
            {checkError ? <span className="mt-2 block text-red-600">{checkError}</span> : null}
          </span>
        ) : null
      }
      confirmLabel="Yes, log out"
      cancelLabel="Stay signed in"
      tone="danger"
      busy={checkingShift}
      onConfirm={confirmLogout}
      onCancel={() => { setCheckError(""); cancelLogout(); }}
    />
    <ConfirmDialog
      open={shiftAlertOpen}
      title="Active Shift Detected"
      message="You currently have an open shift. Please close your shift in Cash Management before logging out."
      confirmLabel="Go to Cash Management"
      cancelLabel="Cancel"
      tone="primary"
      onConfirm={() => {
        setShiftAlertOpen(false);
        router.push("/transactions/cash-management");
      }}
      onCancel={() => setShiftAlertOpen(false)}
    />
    </>
  );
}
