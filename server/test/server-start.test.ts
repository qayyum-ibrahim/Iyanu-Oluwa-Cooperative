import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// Starts the real entry file (src/server.ts) as a child process (step 4.12).
// Every run uses its own settings: a fake secret, a database file in a temporary folder and a
// free port. The dev database and port 3000 are never used. dotenv never overrides a setting
// that is already set, so the values in server/.env are not used for these three.
// Fake values for tests only.

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const TSX = join(SERVER_DIR, "node_modules", ".bin", "tsx");
const FAKE_SECRET = "test-only-secret-for-server-start-0123456789";
const SLOW = { timeout: 30_000 };

interface Started {
  child: ChildProcess;
  output: () => string;
  waitFor: (text: string) => Promise<void>;
  exited: Promise<number | null>;
}

const children: ChildProcess[] = [];
const folders: string[] = [];
const blockers: Server[] = [];

afterEach(() => {
  for (const c of children.splice(0)) if (c.exitCode === null) c.kill("SIGKILL");
  for (const b of blockers.splice(0)) b.close();
  for (const f of folders.splice(0)) rmSync(f, { recursive: true, force: true });
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const address = s.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      s.close(() => resolve(port));
    });
  });
}

function start(settings: { TOKEN_SECRET: string; PORT: number }): Started {
  const folder = mkdtempSync(join(tmpdir(), "iyanu-server-start-"));
  folders.push(folder);
  const child = spawn(TSX, ["src/server.ts"], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      TOKEN_SECRET: settings.TOKEN_SECRET,
      DATABASE_URL: `file:${join(folder, "test.db")}`,
      PORT: String(settings.PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let text = "";
  const waiters: { needle: string; done: () => void }[] = [];
  const onData = (chunk: Buffer) => {
    text += chunk.toString("utf8");
    for (const w of waiters.splice(0)) {
      if (text.includes(w.needle)) w.done();
      else waiters.push(w);
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
  return {
    child,
    output: () => text,
    waitFor: (needle) =>
      new Promise((resolve, reject) => {
        if (text.includes(needle)) {
          resolve();
          return;
        }
        waiters.push({ needle, done: resolve });
        void exited.then(() => {
          if (!text.includes(needle)) reject(new Error(`exited before printing "${needle}"`));
        });
      }),
    exited,
  };
}

describe("server.ts", () => {
  it("refuses to start without a token secret: message, exit code 1, no port", SLOW, async () => {
    const port = await freePort();
    const s = start({ TOKEN_SECRET: "", PORT: port });
    expect(await s.exited).toBe(1);
    expect(s.output()).toContain("Set TOKEN_SECRET in server/.env.");
    expect(s.output()).not.toContain("server listening");
  });

  it("starts on PORT, answers /health, and stops with exit code 0 on SIGTERM", SLOW, async () => {
    const port = await freePort();
    const s = start({ TOKEN_SECRET: FAKE_SECRET, PORT: port });
    await s.waitFor(`server listening on port ${port}`);
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    s.child.kill("SIGTERM");
    expect(await s.exited).toBe(0);
  });

  it("reports a port in use and exits with code 1", SLOW, async () => {
    const port = await freePort();
    const blocker = createServer();
    blockers.push(blocker);
    await new Promise<void>((resolve) => blocker.listen(port, resolve));
    const s = start({ TOKEN_SECRET: FAKE_SECRET, PORT: port });
    expect(await s.exited).toBe(1);
    expect(s.output()).toContain(`Could not listen on port ${port}`);
    expect(s.output()).not.toContain("server listening");
  });
});
