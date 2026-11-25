import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import type {
  ToolExecutionContext,
  ToolExecutionResult,
  ToolInvocation,
  ToolRuntime,
} from '../ai/tools/runtime';
import {
  terminalToolInputSchema,
  terminalToolOutputSchema,
} from '../ai/tools/terminal.tool';
import type { TerminalOutputEvent } from '../shared/terminal-contracts';

type TerminalSession = {
  id: string;
  runId: string;
  conversationId: string;
  shell: string;
  workingDirectory: string;
  process: ChildProcessWithoutNullStreams;
  activeCommand: {
    resolve: (result: ToolExecutionResult) => void;
    marker: string;
    stdout: string;
    stderr: string;
    cancelled: boolean;
  } | null;
};

export type TerminalRuntimeOptions = {
  timeoutMs?: number;
  maxOutputBytes?: number;
  onOutput?: (event: TerminalOutputEvent) => void;
};

export class DesktopTerminalRuntime implements ToolRuntime {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;
  private onOutput?: (event: TerminalOutputEvent) => void;

  constructor(options: TerminalRuntimeOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxOutputBytes = options.maxOutputBytes ?? 1_000_000;
    this.onOutput = options.onOutput;
  }

  setOutputHandler(handler: (event: TerminalOutputEvent) => void): void {
    this.onOutput = handler;
  }

  async execute(
    invocation: ToolInvocation,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    if (invocation.name !== 'terminal') {
      throw new Error(`Unexpected terminal tool name: ${invocation.name}`);
    }
    const input = terminalToolInputSchema.parse(invocation.input);
    const runId = context.runId;
    const conversationId = context.conversationId;
    if (!runId || !conversationId) {
      throw new Error(
        'Terminal execution requires run and conversation identities.',
      );
    }

    let session = input.sessionId
      ? this.sessions.get(input.sessionId)
      : undefined;
    if (
      session &&
      (session.runId !== runId || session.conversationId !== conversationId)
    ) {
      throw new Error(
        'This terminal session belongs to another run or conversation.',
      );
    }
    if (!session) {
      session = this.startSession(
        input.sessionId ?? invocation.id,
        input.workingDirectory ?? process.cwd(),
        runId,
        conversationId,
      );
    }

    if (session.activeCommand) {
      throw new Error('A command is already running in this terminal session.');
    }

    return new Promise((resolve) => {
      const marker = `__CHANAKYA_DONE_${invocation.id}_${Date.now()}__`;
      const commandState = {
        resolve,
        marker,
        stdout: '',
        stderr: '',
        cancelled: false,
      };
      session.activeCommand = commandState;

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        session.process.kill();
        this.finishCommand(session, {
          exitCode: null,
          stdout: this.trimOutput(commandState.stdout),
          stderr: this.trimOutput(commandState.stderr),
          timedOut: true,
          cancelled: false,
        });
      }, this.timeoutMs);

      const cancelListener = () => {
        commandState.cancelled = true;
        session.process.kill();
      };
      context.signal.addEventListener('abort', cancelListener, { once: true });

      const originalResolve = commandState.resolve;
      commandState.resolve = (result) => {
        clearTimeout(timer);
        context.signal.removeEventListener('abort', cancelListener);
        originalResolve(result);
      };

      if (process.platform === 'win32') {
        session.process.stdin.write(
          `${input.command}\r\n[Console]::Out.WriteLine('${marker}')\r\n`,
        );
      } else {
        session.process.stdin.write(
          `${input.command}\nprintf '__CHANAKYA_EXIT__%s\\n${marker}\\n' "$?"\n`,
        );
      }
      void timedOut;
    });
  }

  startSession(
    sessionId: string,
    workingDirectory: string,
    runId: string,
    conversationId: string,
  ): TerminalSession {
    if (!fs.existsSync(workingDirectory)) {
      throw new Error(`Working directory does not exist: ${workingDirectory}`);
    }
    const stat = fs.statSync(workingDirectory);
    if (!stat.isDirectory()) {
      throw new Error(
        `Working directory is not a directory: ${workingDirectory}`,
      );
    }

    const { shell, args } = this.resolveShell();
    const child = spawn(shell, args, {
      cwd: workingDirectory,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams;

    const session: TerminalSession = {
      id: sessionId,
      runId,
      conversationId,
      shell,
      workingDirectory,
      process: child,
      activeCommand: null,
    };
    this.sessions.set(sessionId, session);

    child.stdout.on('data', (chunk: Buffer) => {
      const data = chunk.toString();
      if (session.activeCommand) {
        session.activeCommand.stdout = this.appendOutput(
          session.activeCommand.stdout,
          data,
        );
        const markerIndex = session.activeCommand.stdout.indexOf(
          session.activeCommand.marker,
        );
        if (markerIndex >= 0) {
          const stdout = this.trimOutput(
            session.activeCommand.stdout.slice(0, markerIndex),
          );
          this.finishCommand(session, {
            exitCode: null,
            stdout,
            stderr: this.trimOutput(session.activeCommand.stderr),
            timedOut: false,
            cancelled: false,
          });
          return;
        }
      }
      this.emitOutput({
        type: 'output',
        sessionId,
        runId,
        conversationId,
        stream: 'stdout',
        data: this.trimOutput(data),
      });
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const data = chunk.toString();
      if (session.activeCommand) {
        session.activeCommand.stderr = this.appendOutput(
          session.activeCommand.stderr,
          data,
        );
      }
      this.emitOutput({
        type: 'output',
        sessionId,
        runId,
        conversationId,
        stream: 'stderr',
        data: this.trimOutput(data),
      });
    });

    child.on('exit', (code) => {
      this.emitOutput({
        type: 'completed',
        sessionId,
        runId,
        conversationId,
        exitCode: code,
      });
      if (session.activeCommand) {
        const active = session.activeCommand;
        active.resolve({
          output: terminalToolOutputSchema.parse({
            sessionId,
            shell,
            workingDirectory,
            exitCode: code,
            stdout: this.trimOutput(active.stdout),
            stderr: this.trimOutput(active.stderr),
            cancelled: active.cancelled,
          }),
        });
      }
      this.sessions.delete(sessionId);
    });

    child.on('error', (error) => {
      this.emitOutput({
        type: 'error',
        sessionId,
        runId,
        conversationId,
        message: error.message.slice(0, 500),
      });
    });

    return session;
  }

  cancelCommand(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session?.activeCommand) return false;
    session.activeCommand.cancelled = true;
    session.process.kill();
    return true;
  }

  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.process.kill();
    this.sessions.delete(sessionId);
    return true;
  }

  dispose(): void {
    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId);
    }
  }

  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  private finishCommand(
    session: TerminalSession,
    result: {
      exitCode: number | null;
      stdout: string;
      stderr: string;
      timedOut: boolean;
      cancelled: boolean;
    },
  ) {
    const active = session.activeCommand;
    if (!active) return;
    session.activeCommand = null;
    active.resolve({
      output: terminalToolOutputSchema.parse({
        sessionId: session.id,
        shell: session.shell,
        workingDirectory: session.workingDirectory,
        ...result,
      }),
    });
  }

  private resolveShell(): { shell: string; args: string[] } {
    if (process.platform === 'win32') {
      const candidates = [
        process.env.ProgramFiles &&
          `${process.env.ProgramFiles}\\PowerShell\\7\\pwsh.exe`,
        process.env.SystemRoot &&
          `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
      ].filter((value): value is string => Boolean(value));
      const shell =
        candidates.find((candidate) => fs.existsSync(candidate)) ??
        'powershell.exe';
      return {
        shell,
        args: ['-NoLogo', '-NoProfile', '-NoExit', '-Command', '-'],
      };
    }

    const shell =
      process.env.SHELL && fs.existsSync(process.env.SHELL)
        ? process.env.SHELL
        : process.platform === 'darwin'
          ? '/bin/zsh'
          : '/bin/sh';
    return { shell, args: ['-i'] };
  }

  private appendOutput(current: string, data: string): string {
    if (current.length + data.length <= this.maxOutputBytes) {
      return current + data;
    }
    return (current + data).slice(-this.maxOutputBytes);
  }

  private trimOutput(data: string): string {
    return data.slice(0, this.maxOutputBytes);
  }

  private emitOutput(event: TerminalOutputEvent) {
    this.onOutput?.(event);
  }
}

export type PersistentTerminalRuntime = DesktopTerminalRuntime;
