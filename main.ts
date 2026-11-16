import { createApp } from './app.ts';

const envOrigin = (process.env.MAKEFUN_ENV_URL ?? '').replace(/\/+$/, '');
if (!envOrigin) {
  process.stderr.write('MAKEFUN_ENV_URL is required\n');
  process.exit(1);
}

const requestTimeout = 30_000;
const retryStart = 250;
const retryLimit = 2_000;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function delayFor(failures: number): number {
  return Math.min(retryLimit, retryStart * 2 ** Math.min(failures, 8));
}

async function registerPort(port: number): Promise<void> {
  for (let failures = 0; ; failures += 1) {
    try {
      const response = await fetch(`${envOrigin}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ port }),
        signal: AbortSignal.timeout(requestTimeout),
      });

      // Another entry may already own registration; this process still serves the trial.
      if (response.status === 200 || response.status === 409) return;
      if (response.status === 400 || response.status === 405) {
        throw new Error(`Registration rejected with HTTP ${response.status}: ${await response.text()}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Registration rejected with HTTP ')) {
        throw error;
      }
    }
    await pause(delayFor(failures));
  }
}

async function pollUntilDone(): Promise<void> {
  for (let failures = 0; ; failures += 1) {
    try {
      const response = await fetch(`${envOrigin}/done`, {
        signal: AbortSignal.timeout(requestTimeout),
      });
      if (response.ok) {
        const state = (await response.json()) as { done?: unknown };
        if (state.done === true) return;
      }
    } catch {
      // A transient env or network failure means the trial may still be running.
    }
    await pause(delayFor(failures));
  }
}

function stopServer(server: ReturnType<typeof createApp>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function run(): Promise<void> {
  const server = createApp();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, resolve);
    });

    const bound = server.address();
    if (!bound || typeof bound === 'string') {
      throw new Error('Could not determine the ephemeral listening port');
    }

    process.stdout.write(`Listening on ephemeral port ${bound.port}\n`);
    await registerPort(bound.port);
    await pollUntilDone();
    await stopServer(server);
    process.stdout.write('Environment finished; server closed\n');
  } catch (error) {
    if (server.listening) await stopServer(server).catch(() => undefined);
    throw error;
  }
}

try {
  await run();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
