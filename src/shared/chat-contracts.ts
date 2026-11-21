import { z } from 'zod';

export const chatChannels = {
  sendMessage: 'chat:send-message',
  cancelRun: 'chat:cancel-run',
  event: 'chat:event',
} as const;

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(200_000),
});

const conversationIdSchema = z.string().min(1).max(128);

export const sendMessageInputSchema = z
  .object({
    runId: z.string().uuid(),
    conversationId: conversationIdSchema,
    assistantMessageId: z.string().uuid(),
    providerId: z.string().uuid(),
    messages: z.array(messageSchema).min(1).max(100),
  })
  .superRefine(({ messages }, context) => {
    const totalCharacters = messages.reduce(
      (total, message) => total + message.content.length,
      0,
    );
    if (totalCharacters > 1_000_000) {
      context.addIssue({
        code: 'custom',
        message: 'Conversation context exceeds the maximum size.',
        path: ['messages'],
      });
    }
  });

export const cancelRunInputSchema = z.object({
  runId: z.string().uuid(),
});

const eventBaseSchema = z.object({
  runId: z.string().uuid(),
  conversationId: conversationIdSchema,
  assistantMessageId: z.string().uuid(),
});

export const agentEventSchema = z.discriminatedUnion('type', [
  eventBaseSchema.extend({ type: z.literal('message-started') }),
  eventBaseSchema.extend({
    type: z.literal('text-delta'),
    delta: z.string().max(20_000),
  }),
  eventBaseSchema.extend({ type: z.literal('message-completed') }),
  eventBaseSchema.extend({
    type: z.literal('error'),
    message: z.string().max(500),
  }),
  eventBaseSchema.extend({ type: z.literal('generation-cancelled') }),
]);

export const acceptedChatRunSchema = z.object({
  accepted: z.literal(true),
});

export const cancelledChatRunSchema = z.object({
  cancelled: z.boolean(),
});

export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;
export type ChatPromptMessage = z.infer<typeof messageSchema>;
