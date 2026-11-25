export type ToolExecutionContext = {
  signal: AbortSignal;
  runId?: string;
  conversationId?: string;
};

export type ToolInvocation = {
  id: string;
  name: string;
  input: unknown;
};

export type ToolExecutionResult = {
  output: unknown;
};

export interface ToolRuntime {
  execute(
    invocation: ToolInvocation,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult>;
}

export type ToolApprovalDecision = 'approved' | 'denied';

export type ToolApprovalRequest = {
  approvalId: string;
  runId: string;
  conversationId: string;
  toolName: string;
  command: string;
  workingDirectory: string;
};

export type ToolApprovalRequester = (
  request: ToolApprovalRequest,
  context: ToolExecutionContext,
) => Promise<ToolApprovalDecision>;
