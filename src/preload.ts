import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  ipcChannels,
  providerIdInputSchema,
  providerSettingsSchema,
  saveProviderInputSchema,
  selectProviderInputSchema,
  setProviderEnabledInputSchema,
} from './shared/provider-contracts';
import {
  acceptedChatRunSchema,
  agentEventSchema,
  cancelRunInputSchema,
  cancelledChatRunSchema,
  chatChannels,
  sendMessageInputSchema,
  toolApprovalDecisionSchema,
} from './shared/chat-contracts';
import type { DesktopApi } from './shared/desktop-api';
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
} from './shared/terminal-contracts';

const api: DesktopApi = {
  chat: {
    sendMessage: async (input) => {
      acceptedChatRunSchema.parse(
        await ipcRenderer.invoke(
          chatChannels.sendMessage,
          sendMessageInputSchema.parse(input),
        ),
      );
    },
    cancelRun: async (runId) => {
      const result = cancelledChatRunSchema.parse(
        await ipcRenderer.invoke(
          chatChannels.cancelRun,
          cancelRunInputSchema.parse({ runId }),
        ),
      );
      return result.cancelled;
    },
    decideToolApproval: async (input) =>
      Boolean(
        await ipcRenderer.invoke(
          chatChannels.decideToolApproval,
          toolApprovalDecisionSchema.parse(input),
        ),
      ),
    subscribe: (listener) => {
      const handler = (_event: IpcRendererEvent, rawEvent: unknown) =>
        listener(agentEventSchema.parse(rawEvent));
      ipcRenderer.on(chatChannels.event, handler);
      return () => ipcRenderer.removeListener(chatChannels.event, handler);
    },
  },
  providers: {
    list: async () =>
      providerSettingsSchema.parse(
        await ipcRenderer.invoke(ipcChannels.listProviders),
      ),
    save: async (input) =>
      providerSettingsSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.saveProvider,
          saveProviderInputSchema.parse(input),
        ),
      ),
    delete: async (providerId) =>
      providerSettingsSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.deleteProvider,
          providerIdInputSchema.parse({ providerId }),
        ),
      ),
    setEnabled: async (providerId, enabled) =>
      providerSettingsSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.setProviderEnabled,
          setProviderEnabledInputSchema.parse({ providerId, enabled }),
        ),
      ),
    select: async (providerId) =>
      providerSettingsSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.selectProvider,
          selectProviderInputSchema.parse({ providerId }),
        ),
      ),
  },
  terminal: {
    startSession: async (input) =>
      terminalSessionResultSchema.parse(
        await ipcRenderer.invoke(
          terminalChannels.startSession,
          terminalSessionInputSchema.parse(input),
        ),
      ),
    executeCommand: async (input) =>
      terminalCommandResultSchema.parse(
        await ipcRenderer.invoke(
          terminalChannels.executeCommand,
          terminalCommandInputSchema.parse(input),
        ),
      ),
    cancelCommand: async (sessionId) =>
      Boolean(
        await ipcRenderer.invoke(terminalChannels.cancelCommand, {
          sessionId,
        }),
      ),
    closeSession: async (sessionId, runId) =>
      terminalCloseResultSchema.parse(
        await ipcRenderer.invoke(
          terminalChannels.closeSession,
          terminalCloseInputSchema.parse({ sessionId, runId }),
        ),
      ).closed,
    decideApproval: async (input) =>
      Boolean(
        await ipcRenderer.invoke(
          terminalChannels.approve,
          terminalApprovalDecisionSchema.parse(input),
        ),
      ),
    subscribeApproval: (listener) => {
      const handler = (_event: IpcRendererEvent, rawRequest: unknown) =>
        listener(terminalApprovalRequestSchema.parse(rawRequest));
      ipcRenderer.on(terminalChannels.approvalRequest, handler);
      return () =>
        ipcRenderer.removeListener(terminalChannels.approvalRequest, handler);
    },
    subscribeOutput: (listener) => {
      const handler = (_event: IpcRendererEvent, rawEvent: unknown) =>
        listener(terminalOutputSchema.parse(rawEvent));
      ipcRenderer.on(terminalChannels.output, handler);
      return () => ipcRenderer.removeListener(terminalChannels.output, handler);
    },
  },
};

contextBridge.exposeInMainWorld('chanakya', api);
