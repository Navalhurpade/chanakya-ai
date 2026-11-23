import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { isTerminalEvent, type AgentService } from '../agent/agent-service';
import {
  acceptedChatRunSchema,
  agentEventSchema,
  cancelRunInputSchema,
  cancelledChatRunSchema,
  chatChannels,
  sendMessageInputSchema,
} from '../shared/chat-contracts';
import { assertTrustedSender } from './provider-ipc';

type RunOwner = {
  sender: WebContents;
  onDestroyed: () => void;
};

export function registerChatIpc(
  agent: AgentService,
  isTrustedSender: (senderId: number) => boolean,
) {
  const runOwners = new Map<string, RunOwner>();

  function clearRunOwner(runId: string) {
    const owner = runOwners.get(runId);
    if (!owner) return;
    owner.sender.removeListener('destroyed', owner.onDestroyed);
    runOwners.delete(runId);
  }

  agent.subscribe((agentEvent) => {
    const owner = runOwners.get(agentEvent.runId);
    if (!owner) return;
    if (owner.sender.isDestroyed()) {
      agent.cancelRun(agentEvent.runId);
      clearRunOwner(agentEvent.runId);
      return;
    }

    owner.sender.send(chatChannels.event, agentEventSchema.parse(agentEvent));
    if (isTerminalEvent(agentEvent)) {
      clearRunOwner(agentEvent.runId);
    }
  });

  ipcMain.handle(chatChannels.sendMessage, async (event, rawInput: unknown) => {
    assertTrustedChatSender(event, isTrustedSender);
    const input = sendMessageInputSchema.parse(rawInput);
    if (runOwners.has(input.runId)) {
      throw new Error('This generation is already running.');
    }

    const owner: RunOwner = {
      sender: event.sender,
      onDestroyed: () => {
        agent.cancelRun(input.runId);
        clearRunOwner(input.runId);
      },
    };
    runOwners.set(input.runId, owner);
    event.sender.once('destroyed', owner.onDestroyed);

    try {
      await agent.sendMessage(input);
      return acceptedChatRunSchema.parse({ accepted: true });
    } catch (error) {
      clearRunOwner(input.runId);
      throw error;
    }
  });

  ipcMain.handle(chatChannels.cancelRun, async (event, rawInput: unknown) => {
    assertTrustedChatSender(event, isTrustedSender);
    const { runId } = cancelRunInputSchema.parse(rawInput);
    const owner = runOwners.get(runId);
    if (!owner || owner.sender.id !== event.sender.id) {
      return cancelledChatRunSchema.parse({ cancelled: false });
    }
    return cancelledChatRunSchema.parse({
      cancelled: agent.cancelRun(runId),
    });
  });
}

function assertTrustedChatSender(
  event: IpcMainInvokeEvent,
  isTrustedSender: (senderId: number) => boolean,
) {
  assertTrustedSender(event, isTrustedSender);
}
