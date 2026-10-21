import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// Starts the real entry file (src/server.ts) as a child process (step 4.12), the same way as
// `npm start`: plain node with the tsx loader, so stop signals reach the server itself (step 5.1b).
// The tsx command waits only 30 ms for its child to take a signal, then kills it (A-153).
// Every run uses its own settings: a fake secret, a database file in a temporary folder and a
// free port. The dev database and port 3000 are never used. dotenv never overrides a setting
// that is already set, so the values in server/.env are not used for these three.
// Fake values for tests only.

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
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
  // Each child leads its own process group (detached), so this also ends anything it started.
  // Killing only the old tsx wrapper left servers running (4.12b, A-142).
  for (const c of children.splice(0)) {
    if (c.pid === undefined) continue;
    try {
      process.kill(-c.pid, "SIGKILL");
    } catch {
      // The group has already ended.
    }
  }
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

function newFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "iyanu-server-start-"));
  folders.push(folder);
  return folder;
}

function start(settings: { TOKEN_SECRET: string; PORT: number }): Started {
  const folder = newFolder();
  return startWith({
    ...process.env,
    TOKEN_SECRET: settings.TOKEN_SECRET,
    DATABASE_URL: `file:${join(folder, "test.db")}`,
    PORT: String(settings.PORT),
  });
}

function startWith(env: NodeJS.ProcessEnv): Started {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: SERVER_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
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

  it("still stops with exit code 0 on SIGTERM when the server is slow to take the signal", SLOW, async () => {
    // Under the tsx command this gave 143: it killed a server that took over 30 ms (A-153).
    const port = await freePort();
    const s = start({ TOKEN_SECRET: FAKE_SECRET, PORT: port });
    await s.waitFor(`server listening on port ${port}`);
    const pid = s.child.pid;
    if (pid === undefined) throw new Error("no pid");
    process.kill(pid, "SIGSTOP");
    s.child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 200));
    process.kill(pid, "SIGCONT");
    expect(await s.exited).toBe(0);
  });

  it("stops with exit code 0 on SIGINT (Ctrl+C)", SLOW, async () => {
    const port = await freePort();
    const s = start({ TOKEN_SECRET: FAKE_SECRET, PORT: port });
    await s.waitFor(`server listening on port ${port}`);
    s.child.kill("SIGINT");
    expect(await s.exited).toBe(0);
  });

  it("loads its settings from a dotenv file", SLOW, async () => {
    // DOTENV_PATH points dotenv at a temporary file, so server/.env is not read (dotenv 18.0.7).
    const port = await freePort();
    const folder = newFolder();
    const file = join(folder, "test.env");
    writeFileSync(
      file,
      `TOKEN_SECRET=${FAKE_SECRET}\nDATABASE_URL=file:${join(folder, "test.db")}\nPORT=${port}\n`,
    );
    const env: NodeJS.ProcessEnv = { ...process.env, DOTENV_PATH: file };
    for (const name of ["TOKEN_SECRET", "DATABASE_URL", "PORT", "DOTENV_CONFIG_PATH"]) delete env[name];
    const s = startWith(env);
    await s.waitFor(`server listening on port ${port}`);
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
