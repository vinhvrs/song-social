export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(
      payload?.message || "Không thể kết nối. Vui lòng thử lại.",
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export async function mutate<T>(
  path: string,
  method: "POST" | "DELETE" | "PATCH",
  body?: unknown,
): Promise<T> {
  const { token } = await api<{ token: string }>("/auth/csrf");
  return api<T>(path, {
    method,
    headers: { "X-XSRF-TOKEN": token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Đã xảy ra lỗi. Vui lòng thử lại.";
}
