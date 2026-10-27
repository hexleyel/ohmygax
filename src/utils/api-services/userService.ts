export async function listUsers() {
  const res = await fetch("/api/users");
  if (!res.ok) throw new Error("Failed to load users");
  return res.json();
}

export async function createUser(data: { username: string; full_name: string; role: string }) {
  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to create user");
  return result;
}

export async function resetUserPassword(id: number) {
  const res = await fetch(`/api/users/${id}/reset-password`, { method: "POST" });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to reset password");
  return result;
}

export async function updateUserStatus(id: number, status: "active" | "inactive", currentPassword?: string) {
  const res = await fetch(`/api/users/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, current_password: currentPassword }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to update account status");
  return result;
}

export async function deleteUnusedUser(id: number) {
  const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to remove user account");
  return result;
}

export async function changeOwnPassword(current_password: string, new_password: string) {
  const res = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password, new_password }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to change password");
  return result;
}
