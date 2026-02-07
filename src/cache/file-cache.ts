import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type CacheEnvelope<T> = {
  expiresAt: number;
  value: T;
};

export class FileCache {
  constructor(
    private readonly baseDir: string,
    private readonly now: () => number = () => Date.now()
  ) {}

  private buildPath(namespace: string, key: string): string {
    const digest = createHash("sha256").update(key).digest("hex");
    return path.join(this.baseDir, namespace, `${digest}.json`);
  }

  async get<T>(namespace: string, key: string): Promise<T | null> {
    const filePath = this.buildPath(namespace, key);
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as CacheEnvelope<T>;
      if (typeof parsed.expiresAt !== "number") return null;
      if (parsed.expiresAt <= this.now()) return null;
      return parsed.value;
    } catch {
      return null;
    }
  }

  async set<T>(namespace: string, key: string, value: T, ttlSeconds: number): Promise<void> {
    const filePath = this.buildPath(namespace, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    const envelope: CacheEnvelope<T> = {
      expiresAt: this.now() + Math.max(1, ttlSeconds) * 1000,
      value,
    };
    await writeFile(filePath, JSON.stringify(envelope), "utf-8");
  }
}
