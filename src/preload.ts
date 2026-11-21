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
} from './shared/chat-contracts';
import type { DesktopApi } from './shared/desktop-api';

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
};

contextBridge.exposeInMainWorld('chanakya', api);
