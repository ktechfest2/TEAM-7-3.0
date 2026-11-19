import { describe, expect, it } from "vitest";
import { isNetworkError } from "@/lib/offline/sync";

describe("isNetworkError", () => {
  it.each(["Load failed", "Failed to fetch", "NetworkError when attempting to fetch resource.", "TypeError: fetch failed", "The Internet connection appears to be offline."])(
    "treats %j as a dropped connection",
    (msg) => expect(isNetworkError(new TypeError(msg))).toBe(true),
  );
  it("also reads Supabase error objects", () => expect(isNetworkError({ message: "TypeError: Load failed" })).toBe(true));
  it("does not hide real failures", () => {
    expect(isNetworkError(new Error("No polling unit has the code 01/01/01/999"))).toBe(false);
    expect(isNetworkError(new TypeError("Cannot read properties of undefined"))).toBe(false);
  });
});
