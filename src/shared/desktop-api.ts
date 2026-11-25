import type { ProviderSettings, SaveProviderInput } from './provider-contracts';
import type {
  AgentEvent,
  SendMessageInput,
  ToolApprovalDecisionInput,
} from './chat-contracts';
import type {
  TerminalApprovalDecision,
  TerminalApprovalRequest,
  TerminalCommandInput,
  TerminalCommandResult,
  TerminalOutputEvent,
  TerminalSessionInput,
  TerminalSessionResult,
} from './terminal-contracts';

export type DesktopApi = {
  chat: {
    sendMessage: (input: SendMessageInput) => Promise<void>;
    cancelRun: (runId: string) => Promise<boolean>;
    decideToolApproval: (input: ToolApprovalDecisionInput) => Promise<boolean>;
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
  terminal: {
    startSession: (
      input: TerminalSessionInput,
    ) => Promise<TerminalSessionResult>;
    executeCommand: (
      input: TerminalCommandInput,
    ) => Promise<TerminalCommandResult>;
    cancelCommand: (sessionId: string) => Promise<boolean>;
    closeSession: (sessionId: string, runId: string) => Promise<boolean>;
    decideApproval: (input: TerminalApprovalDecision) => Promise<boolean>;
    subscribeApproval: (
      listener: (request: TerminalApprovalRequest) => void,
    ) => () => void;
    subscribeOutput: (
      listener: (event: TerminalOutputEvent) => void,
    ) => () => void;
  };
};

declare global {
  interface Window {
    chanakya: DesktopApi;
  }
}
