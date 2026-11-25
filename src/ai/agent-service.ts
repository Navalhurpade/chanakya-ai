import type { StoredProvider } from '../shared/provider-contracts';
import type {
  AgentEvent,
  SendMessageInput,
  ToolApprovalRequest,
} from '../shared/chat-contracts';
import { generateResponse } from './engine';
import type { ToolApprovalDecision, ToolRuntime } from './tools/runtime';

export type AgentService = {
  sendMessage(input: SendMessageInput): Promise<void>;
  cancelRun(runId: string): boolean;
  decideToolApproval(
    runId: string,
    approvalId: string,
    decision: ToolApprovalDecision,
  ): boolean;
  subscribe(listener: (event: AgentEvent) => void): () => void;
};

type ActiveRun = {
  controller: AbortController;
  input: SendMessageInput;
};

type ProviderLoader = (providerId: string) => Promise<StoredProvider>;
type ResponseGenerator = typeof generateResponse;
type PendingApproval = {
  runId: string;
  resolve: (decision: ToolApprovalDecision) => void;
  cancel: () => void;
};

const isTerminalEvent = (event: AgentEvent) =>
  event.type === 'message-completed' ||
  event.type === 'generation-cancelled' ||
  event.type === 'error';

export function createAgentService(
  loadProvider: ProviderLoader,
  toolRuntime: ToolRuntime,
  generate: ResponseGenerator = generateResponse,
): AgentService {
  const activeRuns = new Map<string, ActiveRun>();
  const pendingApprovals = new Map<string, PendingApproval>();
  const listeners = new Set<(event: AgentEvent) => void>();

  function publish(event: AgentEvent) {
    for (const listener of listeners) listener(event);
  }

  function requestToolApproval(
    request: Omit<ToolApprovalRequest, 'type' | 'assistantMessageId'>,
    signal: AbortSignal,
    input: SendMessageInput,
  ): Promise<ToolApprovalDecision> {
    if (signal.aborted) return Promise.resolve('denied');

    return new Promise((resolve) => {
      let settled = false;
      const finish = (decision: ToolApprovalDecision) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        pendingApprovals.delete(request.approvalId);
        resolve(decision);
      };
      const onAbort = () => finish('denied');

      pendingApprovals.set(request.approvalId, {
        runId: input.runId,
        resolve: finish,
        cancel: onAbort,
      });
      signal.addEventListener('abort', onAbort, { once: true });

      if (signal.aborted) {
        finish('denied');
        return;
      }

      publish({
        type: 'tool-approval-requested',
        ...request,
        assistantMessageId: input.assistantMessageId,
      });
    });
  }

  function denyRunApprovals(runId: string) {
    for (const approval of pendingApprovals.values()) {
      if (approval.runId === runId) approval.cancel();
    }
  }

  async function executeRun(run: ActiveRun) {
    const { input, controller } = run;
    const eventBase = {
      runId: input.runId,
      conversationId: input.conversationId,
      assistantMessageId: input.assistantMessageId,
    };

    try {
      publish({ type: 'message-started', ...eventBase });
      const provider = await loadProvider(input.providerId);
      await generate(input.messages, provider, {
        mode: input.mode,
        signal: controller.signal,
        runId: input.runId,
        conversationId: input.conversationId,
        toolRuntime,
        requestToolApproval: (request, context) =>
          requestToolApproval(request, context.signal, input),
        onTextDelta: (delta) =>
          publish({ type: 'text-delta', ...eventBase, delta }),
      });

      publish({
        type: controller.signal.aborted
          ? 'generation-cancelled'
          : 'message-completed',
        ...eventBase,
      });
    } catch {
      publish(
        controller.signal.aborted
          ? { type: 'generation-cancelled', ...eventBase }
          : {
              type: 'error',
              ...eventBase,
              message:
                'The provider request failed. Check the API key, model ID, and endpoint settings.',
            },
      );
    } finally {
      denyRunApprovals(input.runId);
      activeRuns.delete(input.runId);
    }
  }

  return {
    async sendMessage(input) {
      if (activeRuns.has(input.runId) || activeRuns.size >= 1) {
        throw new Error('A generation is already running.');
      }

      const run = { controller: new AbortController(), input };
      activeRuns.set(input.runId, run);
      void executeRun(run);
    },

    cancelRun(runId) {
      const run = activeRuns.get(runId);
      if (!run) return false;
      run.controller.abort();
      return true;
    },

    decideToolApproval(runId, approvalId, decision) {
      const approval = pendingApprovals.get(approvalId);
      if (!approval || approval.runId !== runId) return false;
      approval.resolve(decision);
      return true;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export { isTerminalEvent };
