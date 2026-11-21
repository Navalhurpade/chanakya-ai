import { streamText, type ModelMessage } from 'ai';
import type { StoredProvider } from '../shared/provider-contracts';
import { getLanguageModel } from '../model-manager';

export async function generateResponse(
  messages: ModelMessage[],
  provider: StoredProvider,
  options: {
    signal: AbortSignal;
    onTextDelta: (delta: string) => void;
  },
) {
  const result = streamText({
    model: getLanguageModel(provider),
    messages,
    abortSignal: options.signal,
  });

  let response = '';
  for await (const delta of result.textStream) {
    response += delta;
    options.onTextDelta(delta);
  }
  return response;
}
