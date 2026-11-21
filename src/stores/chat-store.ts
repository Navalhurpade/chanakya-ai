import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status?: 'streaming' | 'complete' | 'error' | 'cancelled';
  error?: string;
};

export type Conversation = {
  id: string;
  model: string | null;
  providerId?: string;
  messages: ChatMessage[];
};

type SelectedProvider = {
  id: string;
  model: string;
};

type ChatStore = {
  conversations: Conversation[];
  activeId: string | null;
  startNewConversation: () => void;
  selectConversation: (id: string) => void;
  setConversationProvider: (
    conversationId: string,
    provider: SelectedProvider,
  ) => void;
  submitMessage: (
    content: string,
    provider: SelectedProvider | null,
  ) => { conversationId: string; assistantMessageId: string } | null;
  appendAssistantDelta: (
    conversationId: string,
    messageId: string,
    delta: string,
  ) => void;
  completeAssistantMessage: (conversationId: string, messageId: string) => void;
  failAssistantMessage: (
    conversationId: string,
    messageId: string,
    error: string,
  ) => void;
  cancelAssistantMessage: (conversationId: string, messageId: string) => void;
};

function readLegacyConversations(): Conversation[] {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem('chanakya-conversations-v1') ?? '[]',
    );
    if (!Array.isArray(saved)) return [];
    return saved.filter(
      (item): item is Conversation =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        Array.isArray(item.messages),
    );
  } catch {
    return [];
  }
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      conversations: readLegacyConversations(),
      activeId: null,
      startNewConversation: () => set({ activeId: null }),
      selectConversation: (id) => set({ activeId: id }),
      setConversationProvider: (conversationId, provider) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  providerId: provider.id,
                  model: provider.model,
                }
              : conversation,
          ),
        })),
      submitMessage: (content, provider) => {
        let result: {
          conversationId: string;
          assistantMessageId: string;
        } | null = null;
        set((state) => {
          const text = content.trim();
          if (!text) return state;

          const id = state.activeId ?? crypto.randomUUID();
          const assistantMessageId = crypto.randomUUID();
          const current = state.conversations.find(
            (conversation) => conversation.id === id,
          ) ?? {
            id,
            model: provider?.model ?? null,
            ...(provider ? { providerId: provider.id } : {}),
            messages: [],
          };
          const nextConversation: Conversation = {
            ...current,
            ...(provider
              ? { providerId: provider.id, model: provider.model }
              : {}),
            messages: [
              ...current.messages,
              { id: crypto.randomUUID(), role: 'user', content: text },
              {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                status: provider ? 'streaming' : 'error',
                ...(!provider
                  ? {
                      error:
                        'No model is selected. Choose a provider from the model menu.',
                    }
                  : {}),
              },
            ],
          };

          result = { conversationId: id, assistantMessageId };
          return {
            activeId: id,
            conversations: [
              nextConversation,
              ...state.conversations.filter(
                (conversation) => conversation.id !== id,
              ),
            ],
          };
        });
        return result;
      },
      appendAssistantDelta: (conversationId, messageId, delta) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  messages: conversation.messages.map((message) =>
                    message.id === messageId && message.status === 'streaming'
                      ? { ...message, content: message.content + delta }
                      : message,
                  ),
                }
              : conversation,
          ),
        })),
      completeAssistantMessage: (conversationId, messageId) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  messages: conversation.messages.map((message) =>
                    message.id === messageId && message.status === 'streaming'
                      ? { ...message, status: 'complete' }
                      : message,
                  ),
                }
              : conversation,
          ),
        })),
      failAssistantMessage: (conversationId, messageId, error) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  messages: conversation.messages.map((message) =>
                    message.id === messageId
                      ? { ...message, status: 'error', error }
                      : message,
                  ),
                }
              : conversation,
          ),
        })),
      cancelAssistantMessage: (conversationId, messageId) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  messages: conversation.messages.map((message) =>
                    message.id === messageId && message.status === 'streaming'
                      ? {
                          ...message,
                          status: 'cancelled',
                          error: 'Generation stopped.',
                        }
                      : message,
                  ),
                }
              : conversation,
          ),
        })),
    }),
    {
      name: 'chanakya-chat-state-v2',
      partialize: (state) => ({
        conversations: state.conversations,
        activeId: state.activeId,
      }),
    },
  ),
);
