import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { FileCache } from "../src/cache/file-cache.js";

const dirs: string[] = [];

afterEach(async () => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("FileCache", () => {
  test("stores and reads value within ttl", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "file-cache-"));
    dirs.push(dir);
    let now = 1_000;
    const cache = new FileCache(dir, () => now);

    await cache.set("search", "hello", { v: 1 }, 10);
    const value = await cache.get<{ v: number }>("search", "hello");
    expect(value).toEqual({ v: 1 });

    now = 20_000;
    const expired = await cache.get<{ v: number }>("search", "hello");
    expect(expired).toBeNull();
  });
});
