/**
 * Process runner for local binaries (ffmpeg, ffprobe).
 *
 * Uses child_process.execFile with an argument ARRAY — never a shell
 * string — so filenames can never be interpreted as shell. Callers must
 * still validate/sanitize paths (containment checks live in
 * src/lib/assets/store.ts).
 */
import { execFile } from 'node:child_process';

export interface RunOptions {
  /** Kill the process after this long; default 120s. */
  timeoutMs?: number;
  /** Max stdout+stderr buffer; default 16MB. */
  maxBufferBytes?: number;
  cwd?: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

/** Error thrown when a binary exits non-zero or is killed by timeout. */
export class ProcessError extends Error {
  readonly bin: string;
  readonly args: readonly string[];
  readonly exitCode: number | null;
  readonly stderrTail: string;

  constructor(
    bin: string,
    args: readonly string[],
    exitCode: number | null,
    stderr: string,
    timedOut: boolean,
  ) {
    super(
      timedOut
        ? `${bin} timed out after the configured limit.`
        : `${bin} failed (exit ${exitCode ?? 'unknown'}): ${stderr
            .split('\n')
            .filter(Boolean)
            .slice(-3)
            .join(' | ')
            .slice(0, 300)}`,
    );
    this.name = 'ProcessError';
    this.bin = bin;
    this.args = args;
    this.exitCode = exitCode;
    this.stderrTail = stderr.slice(-2000);
  }
}

/**
 * Run a binary with an argument array. Never interpolates arguments into a
 * shell command, so no quoting/escaping games are needed for paths.
 */
export function runProcess(
  bin: string,
  args: readonly string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      [...args],
      {
        timeout: timeoutMs,
        maxBuffer: opts.maxBufferBytes ?? 16 * 1024 * 1024,
        cwd: opts.cwd,
        // No `shell` — argument array goes straight to execvp.
      },
      (err, stdout, stderr) => {
        if (err) {
          const exitCode =
            typeof (err as { code?: unknown }).code === 'number'
              ? ((err as { code: number }).code as number)
              : null;
          const timedOut = (err as { killed?: boolean }).killed === true;
          reject(
            new ProcessError(bin, args, exitCode, String(stderr ?? ''), timedOut),
          );
          return;
        }
        resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      },
    );
  });
}
