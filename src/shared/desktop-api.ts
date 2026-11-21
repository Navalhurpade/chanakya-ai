import type { ProviderSettings, SaveProviderInput } from './provider-contracts';
import type { AgentEvent, SendMessageInput } from './chat-contracts';

export type DesktopApi = {
  chat: {
    sendMessage: (input: SendMessageInput) => Promise<void>;
    cancelRun: (runId: string) => Promise<boolean>;
    subscribe: (listener: (event: AgentEvent) => void) => () => void;
  };
  providers: {
    list: () => Promise<ProviderSettings>;
    save: (input: SaveProviderInput) => Promise<ProviderSettings>;
    delete: (providerId: string) => Promise<ProviderSettings>;
    setEnabled: (
      providerId: string,
      enabled: boolean,
    ) => Promise<ProviderSettings>;
    select: (providerId: string | null) => Promise<ProviderSettings>;
  };
};

declare global {
  interface Window {
    chanakya: DesktopApi;
  }
}
