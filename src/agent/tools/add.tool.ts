import type { ToolExecutionContext, ToolExecutionResult, ToolInvocation, ToolRuntime } from './runtime';

export type AddNumberInput = {
  a: number;
  b: number;
};

export function addNumber(a: number, b: number): number {
  return a + b;
}

export const addNumberTool: ToolRuntime = {
  async execute(invocation: ToolInvocation, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (invocation.name !== 'addNumber') {
      throw new Error(`Unexpected tool name: ${invocation.name}`);
    }

    if (typeof invocation.input !== 'object') {
      throw new Error('addNumber requires numeric a and b inputs');
    }

    const { a, b } = invocation.input as AddNumberInput;
    return { output: addNumber(a, b) };
  },
};
