import { z } from 'zod';
import type {
  ToolApprovalRequester,
  ToolExecutionResult,
  ToolRuntime,
} from './runtime';

export const terminalToolInputSchema = z.object({
  sessionId: z.string().min(1).max(128).optional(),
  command: z.string().min(1).max(100_000),
  workingDirectory: z.string().min(1).max(4096).optional(),
});

export const terminalToolOutputSchema = z.object({
  sessionId: z.string().min(1).max(128),
  shell: z.string().min(1).max(4096),
  workingDirectory: z.string().min(1).max(4096),
  exitCode: z.number().int().nullable().optional(),
  stdout: z.string().max(1_000_000).optional(),
  stderr: z.string().max(1_000_000).optional(),
  cancelled: z.boolean().optional(),
  denied: z.boolean().optional(),
});

export type TerminalToolInput = z.infer<typeof terminalToolInputSchema>;
export type TerminalToolOutput = z.infer<typeof terminalToolOutputSchema>;

export function createTerminalTool(
  runtime: ToolRuntime,
  requestApproval: ToolApprovalRequester,
): ToolRuntime {
  return {
    async execute(invocation, context): Promise<ToolExecutionResult> {
      if (invocation.name !== 'terminal') {
        throw new Error(`Unexpected tool name: ${invocation.name}`);
      }
      const input = terminalToolInputSchema.parse(invocation.input);
      const runId = context.runId;
      const conversationId = context.conversationId;
      if (!runId || !conversationId) {
        throw new Error(
          'Terminal tools require a run and conversation identity.',
        );
      }

      const approval = await requestApproval(
        {
          approvalId: invocation.id,
          runId,
          conversationId,
          toolName: 'terminal',
          command: input.command,
          workingDirectory: input.workingDirectory ?? process.cwd(),
        },
        context,
      );
      if (approval === 'denied') {
        return {
          output: terminalToolOutputSchema.parse({
            sessionId: input.sessionId ?? invocation.id,
            shell: '',
            workingDirectory: input.workingDirectory ?? process.cwd(),
            denied: true,
          }),
        };
      }

      return runtime.execute(invocation, context);
    },
  };
}
