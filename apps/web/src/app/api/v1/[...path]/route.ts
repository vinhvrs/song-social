import { NextRequest, NextResponse } from "next/server";
import { isSameRequestOrigin } from "@/lib/origin-policy";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const mutating = new Set(["POST", "PATCH", "DELETE"]);
const MAX_BODY_BYTES = 32 * 1024;

async function boundedBody(request: Request) {
  const length = Number(request.headers.get("content-length") || "0");
  if (!Number.isFinite(length) || length > MAX_BODY_BYTES)
    throw new RangeError("Request too large");
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("Request too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const backend = process.env.BACKEND_URL;
  if (!backend)
    return NextResponse.json(
      { message: "Bản xem trước chỉ đọc. Máy chủ ứng dụng chưa được kết nối." },
      { status: 503 },
    );
  if (mutating.has(request.method)) {
    const origin = request.headers.get("origin");
    if (
      !isSameRequestOrigin(
        origin,
        request.headers.get("host"),
        request.nextUrl.protocol,
      )
    )
      return NextResponse.json(
        { message: "Yêu cầu không cùng nguồn." },
        { status: 403 },
      );
  }
  const { path } = await context.params;
  if (
    path.length > 8 ||
    request.nextUrl.search.length > 2048 ||
    path.some(
      (part) =>
        part.length > 128 ||
        part === "." ||
        part === ".." ||
        /[\\/\x00-\x1f]/.test(part),
    )
  )
    return NextResponse.json(
      { message: "Đường dẫn không hợp lệ." },
      { status: 400 },
    );
  let target: URL;
  try {
    target = new URL(
      `/api/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
      backend,
    );
    if (!/^https?:$/.test(target.protocol))
      throw new Error("Unsupported backend protocol");
  } catch {
    return NextResponse.json(
      { message: "Máy chủ chưa được cấu hình đúng." },
      { status: 503 },
    );
  }
  const headers = new Headers({ Accept: "application/json" });
  for (const name of ["content-type", "x-xsrf-token"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .filter((item) => /^(SONG_SESSION|XSRF-TOKEN)=/.test(item))
    .join("; ");
  if (cookie) headers.set("cookie", cookie);
  try {
    const body = mutating.has(request.method)
      ? await boundedBody(request)
      : undefined;
    // Like/save/delete/logout actions may have no request entity. Validate a
    // media type only for a nonempty entity; leave action semantics to Java.
    if (
      body?.byteLength &&
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    ) {
      return NextResponse.json(
        { message: "Chỉ chấp nhận nội dung JSON." },
        { status: 415 },
      );
    }
    const response = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
    });
    const outgoing = new Headers({ "Cache-Control": "no-store" });
    outgoing.set(
      "Content-Type",
      response.headers.get("content-type") || "application/json",
    );
    for (const cookie of response.headers.getSetCookie())
      outgoing.append("Set-Cookie", cookie);
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch (error) {
    if (error instanceof RangeError)
      return NextResponse.json(
        { message: "Nội dung vượt quá giới hạn 32 KiB." },
        { status: 413 },
      );
    return NextResponse.json(
      {
        message:
          "Chưa xác nhận được kết quả từ máy chủ. Hãy tải lại và kiểm tra trước khi thử gửi lại.",
      },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
