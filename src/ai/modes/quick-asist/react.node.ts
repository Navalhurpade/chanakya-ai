import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { END, START, StateGraph, type GraphNode } from '@langchain/langgraph';
import type { ModelMessage } from 'ai';
import type { ChatPromptMessage } from '../../../shared/chat-contracts';
import { aiState } from '../../state.ai';
import type { StoredProvider } from '../../../shared/provider-contracts';
import type { GenerateResponseOptions } from '../../engine';

function toLangChainMessage(message: ChatPromptMessage): BaseMessage {
  switch (message.role) {
    case 'user':
      return new HumanMessage(message.content);
    case 'assistant':
      return new AIMessage(message.content);
  }
}

function toModelMessage(message: BaseMessage): ModelMessage {
  const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

  if (message instanceof SystemMessage) return { role: 'system', content };
  if (message instanceof HumanMessage) return { role: 'user', content };
  if (message instanceof AIMessage) return { role: 'assistant', content };
  throw new Error(`Unsupported message type in quick-assist: ${message.type}`);
}

export async function runQuickAssist(
  messages: ChatPromptMessage[],
  provider: StoredProvider,
  options: GenerateResponseOptions,
  generateModelResponse: (
    messages: ModelMessage[],
    provider: StoredProvider,
    options: GenerateResponseOptions,
  ) => Promise<string>,
): Promise<string> {
  const quickAssistNode: GraphNode<typeof aiState> = async (state) => {
    if (state.mode !== 'quick-assist') {
      throw new Error(`Unsupported graph mode: ${state.mode}`);
    }

    const response = await generateModelResponse(state.messages.map(toModelMessage), provider, options);

    return {
      messages: [new AIMessage(response)],
      count: state.count + 1,
    };
  };

  const graph = new StateGraph(aiState)
    .addNode('quick-assist', quickAssistNode)
    .addEdge(START, 'quick-assist')
    .addEdge('quick-assist', END)
    .compile();
  const result = await graph.invoke(
    {
      mode: 'quick-assist',
      messages: messages.map(toLangChainMessage),
    },
    { signal: options.signal },
  );
  const response = result.messages.at(-1)?.content;
  if (typeof response !== 'string') {
    throw new Error('Quick-assist graph did not produce a text response.');
  }
  return response;
}
