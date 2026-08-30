/** SurvivaLoop — typed client fetch wrapper (relative URLs; works behind the dev proxy). */
export async function api<T = unknown>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: options?.method ?? "GET",
    headers: options?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin",
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const err = new Error(json?.error ?? `Request failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json as T;
}
