import { describe, expect, test } from "vitest";
import { formatCurrentTime, parseCurrentTimeParams } from "../src/tools/current-time.js";

describe("current-time tool", () => {
  test("defaults to Asia/Tokyo when input is missing", () => {
    const params = parseCurrentTimeParams();
    expect(params.timezone).toBe("Asia/Tokyo");
  });

  test("falls back to Asia/Tokyo when timezone is invalid", () => {
    const params = parseCurrentTimeParams(JSON.stringify({ timezone: "Invalid/Timezone" }));
    expect(params.timezone).toBe("Asia/Tokyo");
  });

  test("normalizes JST alias to Asia/Tokyo", () => {
    const params = parseCurrentTimeParams(JSON.stringify({ timezone: "JST" }));
    expect(params.timezone).toBe("Asia/Tokyo");
  });

  test("formats output using normalized timezone", () => {
    const text = formatCurrentTime({ timezone: "JST" });
    expect(text).toContain("Asia/Tokyo の現在時刻:");
  });
});
