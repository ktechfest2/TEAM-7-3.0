import { createHash, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@/lib/hash";

describe("sha256Hex without Web Crypto (plain-http phones)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([0, 1, 55, 56, 63, 64, 65, 1000, 250_000])("matches Node's SHA-256 for %i bytes", async (n) => {
    const bytes = randomBytes(n);
    const expected = createHash("sha256").update(bytes).digest("hex");
    vi.stubGlobal("crypto", {}); // as on an insecure origin: no crypto.subtle
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    expect(await sha256Hex(buf)).toBe(expected);
  });
});

describe("newId without randomUUID (plain-http phones)", () => {
  it("makes valid, unique v4 UUIDs", async () => {
    const { newId } = await import("@/lib/id");
    const real = crypto;
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) });
    const ids = new Set(Array.from({ length: 200 }, newId));
    vi.unstubAllGlobals();
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
