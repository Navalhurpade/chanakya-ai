import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { StoredProvider } from '../shared/provider-contracts';

export function getLanguageModel(provider: StoredProvider): LanguageModel {
  const { apiKey, customHeaders, model } = provider;
  switch (provider.kind) {
    case 'google':
      return createGoogleGenerativeAI({ apiKey, headers: customHeaders })(
        model,
      );
    case 'groq':
      return createGroq({ apiKey, headers: customHeaders })(model);
    case 'openrouter':
      return createOpenRouter({ apiKey, headers: customHeaders }).chat(model);
    case 'openai':
      return createOpenAI({ apiKey, headers: customHeaders }).chat(model);
    case 'anthropic':
      return createAnthropic({ apiKey, headers: customHeaders })(model);
    case 'custom':
      if (!provider.baseUrl) {
        throw new Error('The custom provider has no API base URL.');
      }
      return createOpenAICompatible({
        name: provider.name,
        baseURL: provider.baseUrl,
        apiKey: apiKey || undefined,
        headers: customHeaders,
      }).languageModel(model);
  }
}
