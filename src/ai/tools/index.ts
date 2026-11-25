import { tool, type ToolSet } from 'ai';
import type { ChatMode } from '../../shared/chat-contracts';
import type { ToolApprovalRequester, ToolRuntime } from './runtime';
import {
  createTerminalTool,
  terminalToolInputSchema,
  terminalToolOutputSchema,
} from './terminal.tool';
import { addNumberTool } from './add.tool';

type ToolScope = 'chat';
type ToolNode = ChatMode;

type ToolRegistryContext = {
  runtime: ToolRuntime;
  runId: string;
  conversationId: string;
  signal: AbortSignal;
  requestApproval: ToolApprovalRequester;
};

type ToolDefinition = {
  scopes: readonly ToolScope[];
  nodes: readonly ToolNode[];
  create: (context: ToolRegistryContext) => ToolSet[string];
};

const toolsRegistry = {
  addNumber: {
    scopes: ['chat'],
    nodes: ['quick-assist'],
    create: () => addNumberTool,
  },
  terminal: {
    scopes: ['chat'],
    nodes: ['quick-assist'],
    create: (context: ToolRegistryContext) => {
      const terminalRuntime = createTerminalTool(
        context.runtime,
        context.requestApproval,
      );

      return tool({
        description:
          'Run a command in the local terminal. The user must approve each command.',
        inputSchema: terminalToolInputSchema,
        outputSchema: terminalToolOutputSchema,
        execute: async (input, options) => {
          const result = await terminalRuntime.execute(
            {
              id: options.toolCallId,
              name: 'terminal',
              input,
            },
            {
              signal: options.abortSignal ?? context.signal,
              runId: context.runId,
              conversationId: context.conversationId,
            },
          );
          return terminalToolOutputSchema.parse(result.output);
        },
      });
    },
  },
} satisfies Record<string, ToolDefinition>;

export function getToolsForNode(
  scope: ToolScope,
  node: ToolNode,
  context: ToolRegistryContext,
): ToolSet {
  return Object.fromEntries(
    Object.entries(toolsRegistry)
      .filter(
        ([, definition]) =>
          definition.scopes.includes(scope) && definition.nodes.includes(node),
      )
      .map(([name, definition]) => [name, definition.create(context)]),
  );
}
