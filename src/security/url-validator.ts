import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type ResolvedAddress = {
  address: string;
};

export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export type UrlValidationResult =
  | { ok: true; normalizedUrl: string }
  | { ok: false; reason: string };

const defaultResolver: HostResolver = async (hostname: string) => {
  const rows = await lookup(hostname, { all: true, verbatim: true });
  return rows.map((row) => ({ address: row.address }));
};

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map((v) => Number(v));
  if (parts.length !== 4 || parts.some((v) => Number.isNaN(v))) return true;
  const a = parts[0];
  const b = parts[1];
  if (typeof a !== "number" || typeof b !== "number") return true;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedIpv6(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.replace("::ffff:", "");
    return isBlockedIp(mapped);
  }
  return false;
}

export function isBlockedIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isBlockedIpv4(address);
  if (version === 6) return isBlockedIpv6(address);
  return true;
}

export async function validatePublicHttpUrl(
  rawUrl: string,
  resolver: HostResolver = defaultResolver
): Promise<UrlValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "invalid_protocol" };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local")) {
    return { ok: false, reason: "localhost_blocked" };
  }

  if (isIP(hostname) && isBlockedIp(hostname)) {
    return { ok: false, reason: "private_ip_blocked" };
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = isIP(hostname) ? [{ address: hostname }] : await resolver(hostname);
  } catch {
    return { ok: false, reason: "dns_lookup_failed" };
  }

  if (addresses.length === 0) return { ok: false, reason: "dns_lookup_failed" };
  if (addresses.some((row) => isBlockedIp(row.address))) {
    return { ok: false, reason: "private_ip_blocked" };
  }

  return { ok: true, normalizedUrl: parsed.toString() };
}
