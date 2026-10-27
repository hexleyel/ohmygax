type CategoryPayload = {
  name?: string;
  isCylinder?: boolean;
  is_cylinder?: boolean;
  status?: string;
};

async function readResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.trim() };
  }
}

function responseError(data: unknown, fallback: string) {
  if (typeof data === "object" && data !== null && "error" in data) {
    const error = data.error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return fallback;
}

export async function listCategories(filters: Record<string, string> = {}) {
  const params = new URLSearchParams(filters).toString();
  const res = await fetch(`/api/categories${params ? `?${params}` : ""}`);
  const data = await readResponse(res);
  if (!res.ok) throw new Error(responseError(data, "Failed to load categories"));
  if (!Array.isArray(data)) {
    if (Object.keys(data).length === 0) return [];
    throw new Error(responseError(data, "The categories response was not valid JSON data."));
  }
  return data;
}

export async function createCategory(data: CategoryPayload) {
  const res = await fetch(`/api/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await readResponse(res);
  if (!res.ok) throw new Error(responseError(result, "Failed to create category"));
  return result;
}

export async function updateCategory(id: number, data: CategoryPayload) {
  const res = await fetch(`/api/categories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const responseText = await res.text();
  let result: unknown = {};
  if (responseText.trim()) {
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { error: responseText.trim() };
    }
  }
  if (!res.ok) {
    const detail = responseText.trim() || "<empty response body>";
    console.error(
      `Category update API failed: ${res.status} ${res.statusText}; response: ${detail}`,
    );
    throw new Error(
      responseError(result, `Failed to update category (HTTP ${res.status}).`),
    );
  }
  return result;
}

export async function deleteCategory(id: number) {
  const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
  const result = await readResponse(res);
  if (!res.ok) throw new Error(responseError(result, "Failed to archive category"));
  return result;
}
