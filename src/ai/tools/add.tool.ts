import { tool } from 'ai';
import { z } from 'zod';

export const addNumberSchema = z.object({
  number1: z.number(),
  number2: z.number(),
});

export type AddNumberInput = z.infer<typeof addNumberSchema>;

export function addNumber(a: number, b: number): number {
  return a + b;
}

export const addNumberTool = tool({
  description: 'Add two numbers together.',
  inputSchema: addNumberSchema,
  execute: ({ number1, number2 }) => addNumber(number1, number2),
});
