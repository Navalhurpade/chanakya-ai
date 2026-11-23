import type { StoredProvider } from '../shared/provider-contracts';
import type { AgentEvent, SendMessageInput } from '../shared/chat-contracts';
import { generateResponse } from './engine';

export type AgentService = {
  sendMessage(input: SendMessageInput): Promise<void>;
  cancelRun(runId: string): boolean;
  subscribe(listener: (event: AgentEvent) => void): () => void;
};

type ActiveRun = {
  controller: AbortController;
  input: SendMessageInput;
};

type ProviderLoader = (providerId: string) => Promise<StoredProvider>;
type ResponseGenerator = typeof generateResponse;

const isTerminalEvent = (event: AgentEvent) =>
  event.type === 'message-completed' ||
  event.type === 'generation-cancelled' ||
  event.type === 'error';

export function createAgentService(
  loadProvider: ProviderLoader,
  generate: ResponseGenerator = generateResponse,
): AgentService {
  const activeRuns = new Map<string, ActiveRun>();
  const listeners = new Set<(event: AgentEvent) => void>();

  function publish(event: AgentEvent) {
    for (const listener of listeners) listener(event);
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
        signal: controller.signal,
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

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export { isTerminalEvent };
