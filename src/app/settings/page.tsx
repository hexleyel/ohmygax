"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { getSettings, updateSettings } from "@/utils/api-services/settingsService";
import { DEFAULT_SETTINGS } from "@/lib/defaultSettings";
import ConfirmDialog from "@/components/ConfirmDialog";
import Pagination, { clampPage, pageSlice } from "@/components/Pagination";
import {
  changeOwnPassword,
  createUser,
  listUsers,
  resetUserPassword,
  updateUserStatus,
  deleteUnusedUser,
} from "@/utils/api-services/userService";

function SettingsPageInner() {
  const { user, refresh } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forcePasswordChange = searchParams.get("forcePasswordChange") === "1";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwConfirmOpen, setPwConfirmOpen] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  const [users, setUsers] = useState<any[]>([]);
  const [userFilter, setUserFilter] = useState<"all" | "active" | "inactive">("all");
  const [userStatusTarget, setUserStatusTarget] = useState<any | null>(null);
  const [userStatusAction, setUserStatusAction] = useState<"active" | "inactive">("inactive");
  const [adminPasswordPromptOpen, setAdminPasswordPromptOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [userStatusBusy, setUserStatusBusy] = useState(false);
  const [userStatusError, setUserStatusError] = useState("");
  const [userStatusSuccess, setUserStatusSuccess] = useState("");
  const [deleteUserTarget, setDeleteUserTarget] = useState<any | null>(null);
  const [deleteUserBusy, setDeleteUserBusy] = useState(false);
  const [deleteUserError, setDeleteUserError] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", full_name: "", role: "cashier" });
  const [addUserError, setAddUserError] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState<{ username: string; password: string } | null>(null);

  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupError, setBackupError] = useState("");
  const [lastBackupAt, setLastBackupAt] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  const [settings, setSettings] = useState<Record<string, string>>({ ...DEFAULT_SETTINGS });
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({ ...DEFAULT_SETTINGS });
  const [settingsConfirmOpen, setSettingsConfirmOpen] = useState(false);
  const [settingsSaveBusy, setSettingsSaveBusy] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState("");
  const [settingsSaveSuccess, setSettingsSaveSuccess] = useState("");
  const [displayDateTime, setDisplayDateTime] = useState("");
  const [displayBuildDate, setDisplayBuildDate] = useState("");

  const isAdmin = user?.role === "admin";

  async function loadAll() {
    let safeSettings = { ...DEFAULT_SETTINGS };
    try {
      const result: unknown = await getSettings();
      if (result && typeof result === "object" && !Array.isArray(result)) {
        safeSettings = {
          ...DEFAULT_SETTINGS,
          ...Object.fromEntries(
            Object.entries(result).map(([key, value]) => [key, String(value ?? "")]),
          ),
        };
      }
    } catch (error) {
      console.error("Unable to load settings; using defaults.", error);
    }
    setSettings(safeSettings);
    setSettingsDraft(safeSettings);

    if (isAdmin) {
      try {
        setUsers(await listUsers());
      } catch (error) {
        console.error("Unable to load users.", error);
        setUsers([]);
      }
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    const now = new Date();
    setDisplayDateTime(now.toLocaleString());
    setDisplayBuildDate(now.toLocaleDateString());
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");
    if (!currentPassword) {
      setPwError("Enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match");
      return;
    }
    setPwConfirmOpen(true);
  }

  async function confirmPasswordChange() {
    setPwBusy(true);
    setPwError("");
    try {
      await changeOwnPassword(currentPassword, newPassword);
      setPwSuccess("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwConfirmOpen(false);
      await refresh();
      if (forcePasswordChange) {
        router.push("/dashboard");
      }
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPwBusy(false);
    }
  }

  function closeAddUser() {
    setShowAddUser(false);
    setNewUser({ username: "", full_name: "", role: "cashier" });
    setAddUserError("");
    setGeneratedPassword(null);
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAddUserError("");
    if (!newUser.full_name.trim() || !newUser.username.trim()) {
      setAddUserError("Enter both a full name and username.");
      return;
    }
    try {
      const result = await createUser({ ...newUser, full_name: newUser.full_name.trim(), username: newUser.username.trim() });
      setGeneratedPassword({ username: result.username, password: result.default_password });
      setNewUser({ username: "", full_name: "", role: "cashier" });
      setAddUserError("");
      setShowAddUser(false);
      loadAll();
    } catch (error) {
      setAddUserError(error instanceof Error ? error.message : "Failed to create user account.");
    }
  }

  async function handleResetPassword(id: number, username: string) {
    const result = await resetUserPassword(id);
    setGeneratedPassword({ username, password: result.default_password });
    loadAll();
  }

  async function handleUserStatusChange(target: any, status: "active" | "inactive", currentPassword?: string) {
    setUserStatusError("");
    setUserStatusBusy(true);
    try {
      await updateUserStatus(target.user_id, status, currentPassword);
      setUserStatusTarget(null);
      setAdminPasswordPromptOpen(false);
      setAdminPassword("");
      setShowAdminPassword(false);
      setUserStatusSuccess(status === "active" ? "Account reactivated successfully." : "Account deactivated successfully.");
      await loadAll();
    } catch (error) {
      setUserStatusError(error instanceof Error ? error.message : "Failed to update account status.");
    } finally {
      setUserStatusBusy(false);
    }
  }

  async function handleDeleteUser() {
    if (!deleteUserTarget) return;
    setDeleteUserBusy(true);
    setDeleteUserError("");
    try {
      await deleteUnusedUser(deleteUserTarget.user_id);
      setDeleteUserTarget(null);
      setUserStatusSuccess("Unused account permanently removed.");
      await loadAll();
    } catch (error) {
      setDeleteUserError(error instanceof Error ? error.message : "Failed to remove user account.");
    } finally {
      setDeleteUserBusy(false);
    }
  }

  useEffect(() => {
    if (!userStatusSuccess) return;
    const timeout = window.setTimeout(() => setUserStatusSuccess(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [userStatusSuccess]);

  useEffect(() => {
    if (!pwSuccess) return;
    const timeout = window.setTimeout(() => setPwSuccess(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [pwSuccess]);

  useEffect(() => {
    if (!settingsSaveSuccess) return;
    const timeout = window.setTimeout(() => setSettingsSaveSuccess(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [settingsSaveSuccess]);

  const visibleUsers = users.filter((account) => userFilter === "all" || account.status === userFilter);
  const currentUserPage = clampPage(userPage, visibleUsers.length, 5);
  const pagedUsers = pageSlice(visibleUsers, currentUserPage, 5);

  async function handleBackupNow() {
    setBackupBusy(true);
    setBackupError("");
    setBackupMessage("");
    try {
      const res = await fetch("/api/backup");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Backup failed");

      // Hand the snapshot to the browser as a download.
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `ohmygas-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setLastBackupAt(new Date().toLocaleString());
      setBackupMessage("Backup downloaded.");
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleRestore() {
    if (!restoreFile) return;
    setBackupBusy(true);
    setBackupError("");
    setBackupMessage("");
    try {
      const text = await restoreFile.text();
      const res = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Restore failed");
      setBackupMessage("Backup restored. Reloading…");
      setRestoreFile(null);
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : "Restore failed");
      setRestoreFile(null);
    } finally {
      setBackupBusy(false);
    }
  }

  function handleSaveSettings() {
    setSettingsSaveError("");
    setSettingsConfirmOpen(true);
  }

  async function confirmSaveSettings() {
    setSettingsSaveBusy(true);
    setSettingsSaveError("");
    try {
      const result: unknown = await updateSettings(settingsDraft);
      const savedSettings = result && typeof result === "object" && !Array.isArray(result)
        ? {
            ...DEFAULT_SETTINGS,
            ...Object.fromEntries(
              Object.entries(result).map(([key, value]) => [key, String(value ?? "")]),
            ),
          }
        : { ...settingsDraft };
      setSettings(savedSettings);
      setSettingsDraft(savedSettings);
      setSettingsConfirmOpen(false);
      setSettingsSaveSuccess("Settings saved successfully.");
    } catch (error) {
      setSettingsSaveError(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setSettingsSaveBusy(false);
    }
  }

  if (forcePasswordChange) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
        <div className="w-full max-w-md rounded-2xl border border-blue-600/40 bg-[#ffffff] p-6">
          <p className="mb-1 text-sm uppercase tracking-[0.3em] text-blue-600">
            Action Required
          </p>
          <h1 className="mb-4 text-xl font-semibold">Set a New Password</h1>
          <p className="mb-4 text-sm text-slate-500">
            You are using a default password. Please set a new one before continuing.
          </p>
          <PasswordForm
            currentPassword={currentPassword}
            newPassword={newPassword}
            confirmPassword={confirmPassword}
            setCurrentPassword={setCurrentPassword}
            setNewPassword={setNewPassword}
            setConfirmPassword={setConfirmPassword}
            error={pwError}
            success=""
            onSubmit={handleChangePassword}
            submitLabel="Set Password & Continue"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Settings</p>
        <h1 className="text-3xl font-semibold uppercase">Settings &amp; Security</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
            My Account — Change Password
          </p>
          <PasswordForm
            currentPassword={currentPassword}
            newPassword={newPassword}
            confirmPassword={confirmPassword}
            setCurrentPassword={setCurrentPassword}
            setNewPassword={setNewPassword}
            setConfirmPassword={setConfirmPassword}
            error={pwError}
            success=""
            onSubmit={handleChangePassword}
            submitLabel="Update Password"
          />
        </div>

        {isAdmin ? (
          <div className="rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                User &amp; Account Management
              </p>
              <button
                type="button"
                onClick={() => showAddUser ? closeAddUser() : setShowAddUser(true)}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
              >
                {showAddUser ? "Cancel" : "+ Add User"}
              </button>
            </div>

            {showAddUser ? (
              <form onSubmit={handleAddUser} className="mb-4 space-y-2 rounded-lg border border-[#e2e8f0] p-3">
                <input
                  className="w-full rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-sm"
                  placeholder="Full name"
                  value={newUser.full_name}
                  onChange={(e) => { setNewUser({ ...newUser, full_name: e.target.value }); setAddUserError(""); }}
                />
                <input
                  className="w-full rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-sm"
                  placeholder="Username"
                  value={newUser.username}
                  onChange={(e) => { setNewUser({ ...newUser, username: e.target.value }); setAddUserError(""); }}
                />
                <select
                  className="w-full rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-sm"
                  value={newUser.role}
                  onChange={(e) => { setNewUser({ ...newUser, role: e.target.value }); setAddUserError(""); }}
                >
                  <option value="cashier">Cashier</option>
                  <option value="admin">Administrator</option>
                </select>
                {addUserError ? <p role="alert" className="text-xs text-red-600">{addUserError}</p> : null}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={closeAddUser} className="rounded-lg border border-[#e2e8f0] px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    Cancel
                  </button>
                  <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">
                    Create Account
                  </button>
                </div>
              </form>
            ) : null}

            {generatedPassword ? (
              <div className="mb-4 rounded-lg border border-blue-600/40 bg-blue-600/10 p-3 text-sm">
                <p className="font-semibold text-blue-700">
                  Default password for {generatedPassword.username}:
                </p>
                <p className="font-mono text-lg">{generatedPassword.password}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Write this down now — it will not be shown again.
                </p>
                <button
                  type="button"
                  onClick={() => setGeneratedPassword(null)}
                  className="mt-2 text-xs text-slate-500 underline"
                >
                  Dismiss
                </button>
              </div>
            ) : null}

            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="text-xs font-medium text-slate-500" htmlFor="user-status-filter">Show users</label>
              <select
                id="user-status-filter"
                value={userFilter}
                onChange={(event) => { setUserFilter(event.target.value as "all" | "active" | "inactive"); setUserPage(1); }}
                className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs text-slate-700"
              >
                <option value="all">All Users</option>
                <option value="active">Active Users</option>
                <option value="inactive">Inactive Users</option>
              </select>
            </div>
            {userStatusError && !adminPasswordPromptOpen ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{userStatusError}</p> : null}
            {deleteUserError && !deleteUserTarget ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{deleteUserError}</p> : null}
            <div className="space-y-2">
              {pagedUsers.map((u) => (
                <div
                  key={u.user_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{u.full_name}</span>
                    <span className="ml-2 text-xs uppercase text-slate-500">{u.role}</span>
                    {u.status === "inactive" ? (
                      <span className="ml-2 rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">Inactive</span>
                    ) : null}
                    {u.must_change_password ? (
                      <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                        Default PW
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleResetPassword(u.user_id, u.username)}
                      className="rounded-md border border-[#e2e8f0] px-2 py-1 text-xs text-slate-600 hover:border-blue-600 hover:text-blue-700"
                    >
                      Reset Password
                    </button>
                    {u.status === "inactive" ? (
                      <button
                        type="button"
                        onClick={() => { setUserStatusError(""); setUserStatusSuccess(""); setUserStatusAction("active"); setUserStatusTarget(u); }}
                        disabled={userStatusBusy}
                        className="rounded-md border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      >Reactivate</button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setUserStatusError(""); setUserStatusSuccess(""); setUserStatusAction("inactive"); setUserStatusTarget(u); }}
                        disabled={userStatusBusy || u.user_id === user?.user_id}
                        title={u.user_id === user?.user_id ? "You cannot deactivate your own account" : undefined}
                        className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >Deactivate</button>
                    )}
                    {!u.hasHistory ? (
                      <button
                        type="button"
                        onClick={() => { setDeleteUserError(""); setDeleteUserTarget(u); }}
                        disabled={deleteUserBusy || u.user_id === user?.user_id}
                        title={u.user_id === user?.user_id ? "You cannot remove your own account" : "Permanently remove an account with no history"}
                        className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >Remove</button>
                    ) : null}
                  </div>
                </div>
              ))}
              {visibleUsers.length === 0 ? <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">No users in this status.</p> : null}
            </div>
            {visibleUsers.length > 0 ? (
              <Pagination
                page={currentUserPage}
                total={visibleUsers.length}
                size={5}
                onChange={setUserPage}
                label="users"
              />
            ) : null}
          </div>
        ) : null}

        {isAdmin ? (
        <div className="rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5 lg:col-span-2">
            <div className="grid gap-4 md:grid-cols-[1fr_260px]">
              <div>
                <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Transaction &amp; Tax Settings
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <SettingField
                    label="VAT Rate (%)"
                    value={settingsDraft.vat_rate}
                    onChange={(v) => setSettingsDraft({ ...settingsDraft, vat_rate: v })}
                  />
                  <SettingField
                    label="Cylinder Exchange Fee (₱)"
                    value={settingsDraft.cylinder_exchange_fee}
                    onChange={(v) => setSettingsDraft({ ...settingsDraft, cylinder_exchange_fee: v })}
                  />
                  <SettingField
                    label="Bulk Discount Threshold (units)"
                    value={settingsDraft.bulk_discount_threshold}
                    onChange={(v) => setSettingsDraft({ ...settingsDraft, bulk_discount_threshold: v })}
                  />
                  <SettingField
                    label="Bulk Discount Rate (%)"
                    value={settingsDraft.bulk_discount_rate}
                    onChange={(v) => setSettingsDraft({ ...settingsDraft, bulk_discount_rate: v })}
                  />
                  <SettingField
                    label="Senior Discount Rate (%)"
                    value={settingsDraft.senior_discount_rate}
                    onChange={(v) => setSettingsDraft({ ...settingsDraft, senior_discount_rate: v })}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Save Settings
                </button>
                {settingsSaveError ? <p role="alert" className="mt-2 text-sm text-red-600">{settingsSaveError}</p> : null}
              </div>
              <div className="rounded-lg border border-dashed border-[#e2e8f0] p-3 text-xs text-slate-500">
                <p className="mb-2 font-semibold uppercase text-slate-600">Current Values</p>
                <p>CURRENT VAT · {settings.vat_rate}%</p>
                <p>CYLINDER EXCHANGE FEE · ₱{settings.cylinder_exchange_fee}</p>
                <p>
                  BULK DISCOUNT · {settings.bulk_discount_threshold}+ units ={" "}
                  {settings.bulk_discount_rate}% off
                </p>
                <p>SENIOR DISCOUNT · {settings.senior_discount_rate}%</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
            Date &amp; Time
          </p>
          <p className="text-lg">{displayDateTime}</p>
        </div>

        <div className="rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
            Auto Backup &amp; Restore
          </p>
          {backupMessage ? (
            <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {backupMessage}
            </p>
          ) : null}
          {backupError ? (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {backupError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleBackupNow}
              disabled={backupBusy}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {backupBusy ? "Working…" : "Backup Now"}
            </button>
            <label className="cursor-pointer rounded-lg border border-[#e2e8f0] px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-red-500 hover:text-red-600">
              Restore Backup
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setRestoreFile(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {lastBackupAt ? (
            <p className="mt-3 text-xs text-slate-500">
              Last backup downloaded: {lastBackupAt}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5 lg:col-span-2">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
            About OHMYGAS
          </p>
          <dl className="grid gap-2 text-sm md:grid-cols-2">
            <Row label="SYSTEM" value="OHMYGAS POS & Inventory v1.0.0" />
            <Row label="STORE" value="Island Gas LPG Store" />
            <Row label="LOCATION" value="Kalibo, Aklan" />
            <Row label="BUILD DATE" value={displayBuildDate} />
            <Row label="LICENSE" value="Single Terminal" />
          </dl>
        </div>
      </div>

      <ConfirmDialog
        open={pwConfirmOpen}
        title="Change Password?"
        message={
          <span className="block">
            Are you sure you want to change your password?
            {pwError ? <span role="alert" className="mt-2 block text-sm text-red-600">{pwError}</span> : null}
          </span>
        }
        confirmLabel="Update Password"
        cancelLabel="Cancel"
        tone="primary"
        busy={pwBusy}
        onConfirm={confirmPasswordChange}
        onCancel={() => { setPwConfirmOpen(false); setPwError(""); }}
      />
      <ConfirmDialog
        open={restoreFile !== null}
        title="Restore this backup?"
        message={
          <span>
            This <strong className="text-slate-900">replaces everything</strong>{" "}
            currently in the system with the contents of{" "}
            <strong className="text-slate-900">{restoreFile?.name}</strong>.
            Current sales, stock and accounts will be lost. Take a backup first
            if you aren&apos;t sure.
          </span>
        }
        confirmLabel="Yes, restore"
        cancelLabel="Cancel"
        tone="danger"
        busy={backupBusy}
        onConfirm={handleRestore}
        onCancel={() => setRestoreFile(null)}
      />
      <ConfirmDialog
        open={deleteUserTarget !== null}
        title={`Permanently remove ${deleteUserTarget?.full_name ?? "this account"}?`}
        message={
          <span className="block">
            This permanently deletes an account with no linked history. Accounts with sales, shifts, audit records, reports, or purchase orders cannot be removed and should be deactivated instead.
            {deleteUserError ? <span className="mt-2 block text-sm text-red-600">{deleteUserError}</span> : null}
          </span>
        }
        confirmLabel="Remove Account"
        cancelLabel="Cancel"
        tone="danger"
        busy={deleteUserBusy}
        onConfirm={handleDeleteUser}
        onCancel={() => { setDeleteUserTarget(null); setDeleteUserError(""); }}
      />
      <ConfirmDialog
        open={settingsConfirmOpen}
        title="Save Transaction & Tax Settings?"
        message={
          <span className="block">
            Are you sure you want to update these settings? Changes will immediately apply to calculations across the POS and Delivery modules.
            {settingsSaveError ? <span role="alert" className="mt-2 block text-red-600">{settingsSaveError}</span> : null}
          </span>
        }
        confirmLabel="Save Changes"
        cancelLabel="Cancel"
        busy={settingsSaveBusy}
        onConfirm={confirmSaveSettings}
        onCancel={() => {
          if (!settingsSaveBusy) {
            setSettingsConfirmOpen(false);
            setSettingsSaveError("");
          }
        }}
      />
      <ConfirmDialog
        open={userStatusTarget !== null && !adminPasswordPromptOpen}
        title={`${userStatusAction === "active" ? "Reactivate" : "Deactivate"} ${userStatusTarget?.full_name ?? "this user"}?`}
        message={
          <span className="block">
            {userStatusAction === "active"
              ? "This will restore their access to log into the system."
              : "They will no longer be able to log in. Their historical sales, shift, and audit records will remain available."}
          </span>
        }
        confirmLabel={userStatusAction === "active" ? "Reactivate" : "Deactivate"}
        cancelLabel="Cancel"
        tone={userStatusAction === "active" ? "primary" : "danger"}
        busy={userStatusBusy}
        onConfirm={() => { setUserStatusError(""); setAdminPassword(""); setAdminPasswordPromptOpen(true); }}
        onCancel={() => { setUserStatusTarget(null); setUserStatusError(""); }}
      />
      {adminPasswordPromptOpen && userStatusTarget ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-password-title"
            onSubmit={(event) => {
              event.preventDefault();
              handleUserStatusChange(userStatusTarget, userStatusAction, adminPassword);
            }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <h2 id="admin-password-title" className="text-lg font-semibold text-slate-900">Confirm Admin Password</h2>
            <p className="mt-2 text-sm text-slate-600">Please enter your administrator password to confirm {userStatusAction === "active" ? "reactivating" : "deactivating"} {userStatusTarget.full_name}.</p>
            <label htmlFor="admin-password" className="mt-5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Admin Password</label>
            <div className="mt-1 flex gap-2">
              <input
                autoFocus
                id="admin-password"
                type={showAdminPassword ? "text" : "password"}
                autoComplete="current-password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              <button type="button" onClick={() => setShowAdminPassword((visible) => !visible)} className="rounded-lg border border-[#e2e8f0] px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                {showAdminPassword ? "Hide" : "Show"}
              </button>
            </div>
            {userStatusError ? <p role="alert" className="mt-2 text-sm text-red-600">{userStatusError}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" disabled={userStatusBusy} onClick={() => { setAdminPasswordPromptOpen(false); setUserStatusTarget(null); setAdminPassword(""); setUserStatusError(""); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={userStatusBusy || !adminPassword} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${userStatusAction === "active" ? "bg-blue-600 hover:bg-blue-700" : "bg-red-600 hover:bg-red-700"}`}>
                {userStatusBusy ? "Verifying…" : userStatusAction === "active" ? "Confirm Reactivation" : "Confirm Deactivation"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {userStatusSuccess ? (
        <div role="status" className="fixed right-5 top-5 z-[80] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg">
          {userStatusSuccess}
        </div>
      ) : null}
      {settingsSaveSuccess ? (
        <div role="status" className="fixed right-5 top-20 z-[80] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg">
          {settingsSaveSuccess}
        </div>
      ) : null}
      {pwSuccess ? (
        <div role="status" className="fixed right-5 top-5 z-[80] rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-medium text-emerald-700 shadow-lg">
          {pwSuccess}
        </div>
      ) : null}
    </div>
  );
}

function PasswordForm({
  currentPassword,
  newPassword,
  confirmPassword,
  setCurrentPassword,
  setNewPassword,
  setConfirmPassword,
  error,
  success,
  onSubmit,
  submitLabel,
}: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  setCurrentPassword: (v: string) => void;
  setNewPassword: (v: string) => void;
  setConfirmPassword: (v: string) => void;
  error: string;
  success: string;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
}) {
  const [showPasswords, setShowPasswords] = useState(false);
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <PasswordInput
        placeholder="Current password"
        value={currentPassword}
        onChange={setCurrentPassword}
        show={showPasswords}
      />
      <PasswordInput
        placeholder="New password"
        value={newPassword}
        onChange={setNewPassword}
        show={showPasswords}
      />
      <PasswordInput
        placeholder="Confirm new password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        show={showPasswords}
      />
      <label className="flex items-center gap-2 text-xs text-slate-500">
        <input
          type="checkbox"
          checked={showPasswords}
          onChange={(e) => setShowPasswords(e.target.checked)}
        />
        Show password
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
      <button className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
        {submitLabel}
      </button>
    </form>
  );
}

function SettingField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-500">{label}</label>
      <input
        type="number"
        className="w-full rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-sm"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-[#e2e8f0] pb-1">
      <dt className="text-slate-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f1f5f9]" />}>
      <SettingsPageInner />
    </Suspense>
  );
}

function PasswordInput({
  placeholder,
  value,
  onChange,
  show,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
}) {
  return (
    <input
      type={show ? "text" : "password"}
      placeholder={placeholder}
      className="w-full rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
