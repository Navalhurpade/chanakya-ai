import {
  registerTelemetry,
  stepCountIs,
  streamText,
  type ModelMessage,
} from 'ai';
import type { ChatMode, ChatPromptMessage, ToolApprovalRequest } from '../shared/chat-contracts';
import type { StoredProvider } from '../shared/provider-contracts';
import { getLanguageModel } from '../model-manager';
import type { ToolApprovalDecision, ToolExecutionContext, ToolRuntime } from './tools/runtime';
import { runQuickAssist } from './modes/quick-asist/react.node';
import { getToolsForNode } from './tools';
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { LangSmithTelemetry } from 'langsmith/experimental/vercel';

export const DUMMY_SYSTEM_MESSAGE = 'You are a helpful assistant. Answer clearly and concisely.';

registerTelemetry(
  LangSmithTelemetry({
    name: 'Chanakya AI',
    runType: 'chain',
  }),
);

export type GenerateResponseOptions = {
  mode: ChatMode;
  signal: AbortSignal;
  runId: string;
  conversationId: string;
  onTextDelta: (delta: string) => void;
  toolRuntime: ToolRuntime;
  requestToolApproval: (
    request: Omit<ToolApprovalRequest, 'type' | 'assistantMessageId'>,
    context: ToolExecutionContext,
  ) => Promise<ToolApprovalDecision>;
};

async function generateModelResponse(
  messages: ModelMessage[],
  provider: StoredProvider,
  options: GenerateResponseOptions,
) {
  const tools = getToolsForNode('chat', 'quick-assist', {
    runtime: options.toolRuntime,
    runId: options.runId,
    conversationId: options.conversationId,
    signal: options.signal,
    requestApproval: options.requestToolApproval,
  });
  const result = streamText({
    model: getLanguageModel(provider),
    system: new SystemMessage(DUMMY_SYSTEM_MESSAGE),
    messages,
    abortSignal: options.signal,
    tools,
    stopWhen: stepCountIs(5),
  });

  let response = '';
  for await (const delta of result.textStream) {
    response += delta;
    options.onTextDelta(delta);
  }
  return response;
}

export async function generateResponse(
  messages: ChatPromptMessage[],
  provider: StoredProvider,
  options: GenerateResponseOptions,
) {
  switch (options.mode) {
    case 'quick-assist':
      return runQuickAssist(messages, provider, options, generateModelResponse);
  }
}
