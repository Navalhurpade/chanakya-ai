import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import {
  acceptedChatRunSchema,
  agentEventSchema,
  cancelRunInputSchema,
  cancelledChatRunSchema,
  chatChannels,
  sendMessageInputSchema,
  type AgentEvent,
} from '../shared/chat-contracts';
import { generateResponse } from '../ai-core/engine';
import { assertTrustedSender, loadProviderForChat } from './provider-ipc';

type ActiveRun = {
  controller: AbortController;
  sender: WebContents;
};

const activeRuns = new Map<string, ActiveRun>();

function assertTrustedChatSender(
  event: IpcMainInvokeEvent,
  isTrustedSender: (senderId: number) => boolean,
) {
  assertTrustedSender(event, isTrustedSender);
}

function publish(run: ActiveRun, event: AgentEvent) {
  if (!run.sender.isDestroyed()) {
    run.sender.send(chatChannels.event, agentEventSchema.parse(event));
  }
}

export function registerChatIpc(
  isTrustedSender: (senderId: number) => boolean,
) {
  ipcMain.handle(chatChannels.sendMessage, async (event, rawInput: unknown) => {
    assertTrustedChatSender(event, isTrustedSender);
    const input = sendMessageInputSchema.parse(rawInput);
    if (activeRuns.has(input.runId) || activeRuns.size >= 1) {
      throw new Error('A generation is already running in this window.');
    }

    const run: ActiveRun = {
      controller: new AbortController(),
      sender: event.sender,
    };
    activeRuns.set(input.runId, run);
    const abortForDestroyedSender = () => run.controller.abort();
    event.sender.once('destroyed', abortForDestroyedSender);
    publish(run, {
      type: 'message-started',
      runId: input.runId,
      conversationId: input.conversationId,
      assistantMessageId: input.assistantMessageId,
    });

    void (async () => {
      try {
        const provider = await loadProviderForChat(input.providerId);
        await generateResponse(input.messages, provider, {
          signal: run.controller.signal,
          onTextDelta: (delta) =>
            publish(run, {
              type: 'text-delta',
              runId: input.runId,
              conversationId: input.conversationId,
              assistantMessageId: input.assistantMessageId,
              delta,
            }),
        });
        if (run.controller.signal.aborted) {
          publish(run, {
            type: 'generation-cancelled',
            runId: input.runId,
            conversationId: input.conversationId,
            assistantMessageId: input.assistantMessageId,
          });
        } else {
          publish(run, {
            type: 'message-completed',
            runId: input.runId,
            conversationId: input.conversationId,
            assistantMessageId: input.assistantMessageId,
          });
        }
      } catch {
        if (run.controller.signal.aborted) {
          publish(run, {
            type: 'generation-cancelled',
            runId: input.runId,
            conversationId: input.conversationId,
            assistantMessageId: input.assistantMessageId,
          });
        } else {
          publish(run, {
            type: 'error',
            runId: input.runId,
            conversationId: input.conversationId,
            assistantMessageId: input.assistantMessageId,
            message:
              'The provider request failed. Check the API key, model ID, and endpoint settings.',
          });
        }
      } finally {
        event.sender.removeListener('destroyed', abortForDestroyedSender);
        activeRuns.delete(input.runId);
      }
    })();

    return acceptedChatRunSchema.parse({ accepted: true });
  });

  ipcMain.handle(chatChannels.cancelRun, async (event, rawInput: unknown) => {
    assertTrustedChatSender(event, isTrustedSender);
    const { runId } = cancelRunInputSchema.parse(rawInput);
    const run = activeRuns.get(runId);
    if (!run || run.sender.id !== event.sender.id) {
      return cancelledChatRunSchema.parse({ cancelled: false });
    }
    run.controller.abort();
    return cancelledChatRunSchema.parse({ cancelled: true });
  });
}
