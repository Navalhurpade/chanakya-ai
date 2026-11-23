export type ToolExecutionContext = {
  signal: AbortSignal;
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
