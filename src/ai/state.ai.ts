import { MessagesValue, StateSchema } from '@langchain/langgraph';
import { chatModeSchema } from '../shared/chat-contracts';
import { z } from 'zod';

export const aiState = new StateSchema({
  messages: MessagesValue,
  mode: chatModeSchema,
  count: z.number().default(0),
});
