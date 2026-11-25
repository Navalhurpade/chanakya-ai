import type { IpcMainInvokeEvent, WebContents } from 'electron';
import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import type { DesktopTerminalRuntime } from './terminal-runtime';
import { assertTrustedSender } from './provider-ipc';
import {
  terminalApprovalDecisionSchema,
  terminalApprovalRequestSchema,
  terminalChannels,
  terminalCloseInputSchema,
  terminalCloseResultSchema,
  terminalCommandInputSchema,
  terminalCommandResultSchema,
  terminalOutputSchema,
  terminalSessionInputSchema,
  terminalSessionResultSchema,
  type TerminalOutputEvent,
} from '../shared/terminal-contracts';

type PendingApproval = {
  sender: WebContents;
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
};

export function registerTerminalIpc(
  runtime: DesktopTerminalRuntime,
  isTrustedSender: (senderId: number) => boolean,
) {
  const owners = new Map<string, { sender: WebContents; runId: string }>();
  const pending = new Map<string, PendingApproval>();

  function assertSender(event: IpcMainInvokeEvent) {
    assertTrustedSender(event, isTrustedSender);
  }

  ipcMain.handle(
    terminalChannels.startSession,
    async (event, rawInput: unknown) => {
      assertSender(event);
      const input = terminalSessionInputSchema.parse(rawInput);
      if (
        owners.has(input.sessionId) &&
        owners.get(input.sessionId)?.sender.id !== event.sender.id
      ) {
        throw new Error('This terminal session belongs to another renderer.');
      }
      const session = runtime.startSession(
        input.sessionId,
        input.workingDirectory,
        input.runId,
        input.conversationId,
      );
      owners.set(input.sessionId, { sender: event.sender, runId: input.runId });
      return terminalSessionResultSchema.parse({
        sessionId: input.sessionId,
        shell: session.shell,
        workingDirectory: session.workingDirectory,
      });
    },
  );

  ipcMain.handle(
    terminalChannels.executeCommand,
    async (event, rawInput: unknown) => {
      assertSender(event);
      const input = terminalCommandInputSchema.parse(rawInput);
      const owner = owners.get(input.sessionId);
      if (
        !owner ||
        owner.sender.id !== event.sender.id ||
        owner.runId !== input.runId
      ) {
        throw new Error('The terminal session is not owned by this run.');
      }

      const session = runtime.getSession(input.sessionId);
      if (!session) throw new Error('Terminal session is not running.');
      const approvalId = randomUUID();
      const approvalRequest = terminalApprovalRequestSchema.parse({
        approvalId,
        sessionId: input.sessionId,
        runId: input.runId,
        conversationId: input.conversationId,
        command: input.command,
        workingDirectory: session.workingDirectory,
      });
      event.sender.send(terminalChannels.approvalRequest, approvalRequest);

      const approved = await waitForApproval(approvalId, event.sender);
      if (!approved) {
        return terminalCommandResultSchema.parse({
          sessionId: input.sessionId,
          exitCode: null,
          stdout: '',
          stderr: '',
          timedOut: false,
          cancelled: false,
        });
      }

      const result = await runtime.execute(
        {
          id: approvalId,
          name: 'terminal',
          input: {
            sessionId: input.sessionId,
            command: input.command,
            workingDirectory: session.workingDirectory,
          },
        },
        {
          signal: new AbortController().signal,
          runId: input.runId,
          conversationId: input.conversationId,
        },
      );
      const output = result.output as {
        exitCode?: number | null;
        stdout?: string;
        stderr?: string;
        timedOut?: boolean;
        cancelled?: boolean;
      };
      return terminalCommandResultSchema.parse({
        sessionId: input.sessionId,
        exitCode: output.exitCode ?? null,
        stdout: output.stdout ?? '',
        stderr: output.stderr ?? '',
        timedOut: output.timedOut ?? false,
        cancelled: output.cancelled ?? false,
      });
    },
  );

  ipcMain.handle(
    terminalChannels.cancelCommand,
    async (event, rawInput: unknown) => {
      assertSender(event);
      const input = rawInput as { sessionId?: unknown };
      if (!input || typeof input.sessionId !== 'string') return false;
      const owner = owners.get(input.sessionId);
      return Boolean(
        owner &&
        owner.sender.id === event.sender.id &&
        runtime.cancelCommand(input.sessionId),
      );
    },
  );

  ipcMain.handle(
    terminalChannels.closeSession,
    async (event, rawInput: unknown) => {
      assertSender(event);
      const input = terminalCloseInputSchema.parse(rawInput);
      const owner = owners.get(input.sessionId);
      if (
        !owner ||
        owner.sender.id !== event.sender.id ||
        owner.runId !== input.runId
      ) {
        return terminalCloseResultSchema.parse({ closed: false });
      }
      owners.delete(input.sessionId);
      return terminalCloseResultSchema.parse({
        closed: runtime.closeSession(input.sessionId),
      });
    },
  );

  ipcMain.handle(terminalChannels.approve, async (event, rawInput: unknown) => {
    assertSender(event);
    const decision = terminalApprovalDecisionSchema.parse(rawInput);
    const request = pending.get(decision.approvalId);
    if (!request || request.sender.id !== event.sender.id) return false;
    clearTimeout(request.timer);
    pending.delete(decision.approvalId);
    request.resolve(decision.decision === 'approve');
    return true;
  });

  function waitForApproval(
    approvalId: string,
    sender: WebContents,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(approvalId);
        resolve(false);
      }, 5 * 60_000);
      pending.set(approvalId, { sender, resolve, timer });
    });
  }

  const forwardOutput = (event: TerminalOutputEvent) =>
    forOwners(event, (owner) =>
      owner.sender.send(
        terminalChannels.output,
        terminalOutputSchema.parse(event),
      ),
    );
  runtime.setOutputHandler(forwardOutput);

  function forOwners(
    event: TerminalOutputEvent,
    callback: (owner: { sender: WebContents; runId: string }) => void,
  ) {
    if (event.sessionId) {
      const owner = owners.get(event.sessionId);
      if (owner && owner.runId === event.runId) callback(owner);
    }
  }

  return {
    dispose() {
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.resolve(false);
      }
      pending.clear();
      runtime.dispose();
    },
  };
}
