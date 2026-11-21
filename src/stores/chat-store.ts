import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  error?: 'provider-not-configured';
};

export type Conversation = {
  id: string;
  model: string | null;
  messages: ChatMessage[];
};

type ChatStore = {
  conversations: Conversation[];
  activeId: string | null;
  startNewConversation: () => void;
  selectConversation: (id: string) => void;
  submitMessage: (content: string) => void;
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
      submitMessage: (content) =>
        set((state) => {
          const text = content.trim();
          if (!text) return state;

          const id = state.activeId ?? crypto.randomUUID();
          const current = state.conversations.find(
            (conversation) => conversation.id === id,
          ) ?? { id, model: null, messages: [] };
          const nextConversation: Conversation = {
            ...current,
            messages: [
              ...current.messages,
              { role: 'user', content: text },
              {
                role: 'assistant',
                content: '',
                error: 'provider-not-configured',
              },
            ],
          };

          return {
            activeId: id,
            conversations: [
              nextConversation,
              ...state.conversations.filter(
                (conversation) => conversation.id !== id,
              ),
            ],
          };
        }),
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
