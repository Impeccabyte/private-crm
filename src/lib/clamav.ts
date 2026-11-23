/**
 * Minimal clamd client (TCP, INSTREAM). No dependency: the protocol is "zINSTREAM\0", then chunks each
 * prefixed with a 4-byte big-endian length, then a zero-length chunk; clamd replies "stream: OK" or
 * "stream: <signature> FOUND". Host/port come from CLAMAV_HOST / CLAMAV_PORT (set in Docker Compose).
 */
import net from "node:net";

export type ScanResult = { status: "clean" } | { status: "infected"; signature: string };

export class ScannerUnavailable extends Error {}

export const scannerConfigured = () => !!process.env.CLAMAV_HOST;

function talk(payload: (sock: net.Socket) => void, timeoutMs: number): Promise<string> {
  const host = process.env.CLAMAV_HOST, port = Number(process.env.CLAMAV_PORT || 3310);
  if (!host) return Promise.reject(new ScannerUnavailable("Virus scanning isn’t configured (CLAMAV_HOST is not set)."));
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    const chunks: Buffer[] = [];
    let settled = false;
    const done = (err: Error | null, out?: string) => {
      if (settled) return; settled = true; sock.destroy();
      if (err) reject(err); else resolve(out!);
    };
    sock.setTimeout(timeoutMs, () => done(new ScannerUnavailable(`The virus scanner didn’t answer within ${Math.round(timeoutMs / 1000)}s.`)));
    sock.on("error", (e) => done(new ScannerUnavailable(`Can’t reach the virus scanner (${(e as NodeJS.ErrnoException).code ?? e.message}).`)));
    sock.on("data", (d) => chunks.push(d));
    sock.on("end", () => done(null, Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim()));
    sock.on("connect", () => payload(sock));
  });
}

export async function scanBuffer(data: Buffer, timeoutMs = 20_000): Promise<ScanResult> {
  const reply = await talk((sock) => {
    sock.write("zINSTREAM\0");
    const CHUNK = 64 * 1024;
    for (let i = 0; i < data.length; i += CHUNK) {
      const part = data.subarray(i, i + CHUNK);
      const len = Buffer.alloc(4); len.writeUInt32BE(part.length);
      sock.write(len); sock.write(part);
    }
    sock.end(Buffer.alloc(4)); // zero-length chunk = end of stream
  }, timeoutMs);
  if (/:\s*OK$/.test(reply)) return { status: "clean" };
  const found = reply.match(/:\s*(.+)\s+FOUND$/);
  if (found) return { status: "infected", signature: found[1]!.trim() };
  // e.g. "INSTREAM size limit exceeded. ERROR" or a database still loading
  throw new ScannerUnavailable(`The virus scanner returned an error: ${reply.slice(0, 200) || "no reply"}`);
}

/** "ClamAV 1.4.3/27463/Fri Nov 20 08:24:01 2026" → engine, signature version and date; null if unreachable. */
export async function scannerVersion(): Promise<{ engine: string; signatures: string | null; updated: string | null } | null> {
  try {
    const v = await talk((sock) => sock.end("zVERSION\0"), 5_000);
    const [engine, sigs, date] = v.split("/");
    return { engine: engine ?? v, signatures: sigs ?? null, updated: date ?? null };
  } catch {
    return null;
  }
}
