/**
 * Always return a plain string suitable for textContent — never an object
 * (avoids the LinksView `[object Object]` bug).
 */
export function asErrorText(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "";
  }
  if (value && typeof value === "object") {
    const obj = value as { message?: unknown; error?: unknown };
    if (typeof obj.message === "string" && obj.message.trim()) {
      return obj.message.trim();
    }
    if (typeof obj.error === "string" && obj.error.trim()) {
      return obj.error.trim();
    }
  }
  return "";
}

export function loginErrorMessage(data: unknown, status: number): string {
  const body = data as { error?: unknown; message?: unknown } | null;
  const fromBody =
    asErrorText(body?.error) || asErrorText(body?.message) || asErrorText(data);
  if (fromBody) return fromBody;
  if (status === 429) return "Too many attempts. Wait a minute.";
  if (status === 503) return "Site password is not configured";
  if (status >= 500) return "Server error. Try again in a moment.";
  return "Wrong password";
}
