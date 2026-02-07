import { describe, expect, test } from "vitest";
import { isBlockedIp, validatePublicHttpUrl } from "../src/security/url-validator.js";

describe("url-validator", () => {
  test("blocks local/private ipv4", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.0.0.5")).toBe(true);
    expect(isBlockedIp("192.168.1.5")).toBe(true);
  });

  test("allows public host when resolver returns public ip", async () => {
    const result = await validatePublicHttpUrl("https://example.com", async () => [
      { address: "93.184.216.34" },
    ]);
    expect(result.ok).toBe(true);
  });

  test("blocks host when resolver returns private ip", async () => {
    const result = await validatePublicHttpUrl("https://example.com", async () => [
      { address: "10.1.2.3" },
    ]);
    expect(result).toEqual({ ok: false, reason: "private_ip_blocked" });
  });
});
