export async function getCashSessionStatus() {
  const res = await fetch("/api/cash-sessions", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load cash session");
  return res.json();
}

export async function openCashSession(beginning_balance: number) {
  const res = await fetch("/api/cash-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ beginning_balance }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to open shift");
  return data;
}

export async function closeCashSession(actual_cash_counted: number) {
  const res = await fetch("/api/cash-sessions/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actual_cash_counted }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to close shift");
  return data;
}
