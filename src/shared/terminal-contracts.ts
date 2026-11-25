import { z } from 'zod';

export const terminalChannels = {
  startSession: 'terminal:start-session',
  executeCommand: 'terminal:execute-command',
  cancelCommand: 'terminal:cancel-command',
  closeSession: 'terminal:close-session',
  approve: 'terminal:approve',
  approvalRequest: 'terminal:approval-request',
  output: 'terminal:output',
  event: 'terminal:event',
} as const;

const sessionIdSchema = z.string().min(1).max(128);
const runIdSchema = z.string().uuid();
const conversationIdSchema = z.string().min(1).max(128);

export const terminalSessionInputSchema = z.object({
  sessionId: sessionIdSchema,
  runId: runIdSchema,
  conversationId: conversationIdSchema,
  workingDirectory: z.string().min(1).max(4096),
});

export const terminalCommandInputSchema = z.object({
  sessionId: sessionIdSchema,
  runId: runIdSchema,
  conversationId: conversationIdSchema,
  command: z.string().min(1).max(100_000),
});

export const terminalApprovalRequestSchema = z.object({
  approvalId: z.string().uuid(),
  sessionId: sessionIdSchema,
  runId: runIdSchema,
  conversationId: conversationIdSchema,
  command: z.string().min(1).max(100_000),
  workingDirectory: z.string().min(1).max(4096),
});

export const terminalApprovalDecisionSchema = z.object({
  approvalId: z.string().uuid(),
  runId: runIdSchema,
  decision: z.enum(['approve', 'deny']),
});

export const terminalOutputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('output'),
    sessionId: sessionIdSchema,
    runId: runIdSchema,
    conversationId: conversationIdSchema,
    stream: z.enum(['stdout', 'stderr']),
    data: z.string().max(1_000_000),
  }),
  z.object({
    type: z.literal('completed'),
    sessionId: sessionIdSchema,
    runId: runIdSchema,
    conversationId: conversationIdSchema,
    exitCode: z.number().int().nullable(),
  }),
  z.object({
    type: z.literal('error'),
    sessionId: sessionIdSchema,
    runId: runIdSchema,
    conversationId: conversationIdSchema,
    message: z.string().max(500),
  }),
]);

export const terminalSessionResultSchema = z.object({
  sessionId: sessionIdSchema,
  shell: z.string().min(1).max(4096),
  workingDirectory: z.string().min(1).max(4096),
});

export const terminalCommandResultSchema = z.object({
  sessionId: sessionIdSchema,
  exitCode: z.number().int().nullable(),
  stdout: z.string().max(1_000_000),
  stderr: z.string().max(1_000_000),
  timedOut: z.boolean(),
  cancelled: z.boolean(),
});

export const terminalCloseInputSchema = z.object({
  sessionId: sessionIdSchema,
  runId: runIdSchema,
});

export const terminalCloseResultSchema = z.object({ closed: z.boolean() });

export type TerminalSessionInput = z.infer<typeof terminalSessionInputSchema>;
export type TerminalCommandInput = z.infer<typeof terminalCommandInputSchema>;
export type TerminalApprovalRequest = z.infer<
  typeof terminalApprovalRequestSchema
>;
export type TerminalApprovalDecision = z.infer<
  typeof terminalApprovalDecisionSchema
>;
export type TerminalOutputEvent = z.infer<typeof terminalOutputSchema>;
export type TerminalSessionResult = z.infer<typeof terminalSessionResultSchema>;
export type TerminalCommandResult = z.infer<typeof terminalCommandResultSchema>;
