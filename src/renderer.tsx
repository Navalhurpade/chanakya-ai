import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Circle,
  Globe,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  PanelLeft,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import type { ChatMessage } from './stores/chat-store';
import { useChatStore } from './stores/chat-store';
import './index.css';

type SettingsTab = 'providers' | 'models' | 'general';

const suggestions = [
  {
    title: 'Make a plan',
    detail: 'Bring a little more focus to your week',
    prompt: 'Help me plan my week with more focus',
    icon: Zap,
    tone: 'mint',
  },
  {
    title: 'Help me write',
    detail: 'Find just the right words',
    prompt: 'Help me write a thoughtful message',
    icon: MessageCircle,
    tone: 'violet',
  },
  {
    title: 'Learn something',
    detail: 'Make a tricky topic feel simple',
    prompt: 'Explain a complex topic in simple terms',
    icon: Sparkles,
    tone: 'amber',
  },
  {
    title: 'Explore an idea',
    detail: 'Start with a spark of curiosity',
    prompt: 'Give me creative ideas for a new project',
    icon: Globe,
    tone: 'blue',
  },
];

const providers = [
  { name: 'Google Gemini', detail: 'Gemini models', logo: 'G', tone: 'google' },
  { name: 'Groq', detail: 'Fast inference', logo: '◈', tone: 'groq' },
  {
    name: 'OpenAI compatible',
    detail: 'OpenAI, OpenRouter, custom APIs',
    logo: '✳',
    tone: 'openai',
  },
];

function getConversationTitle(
  conversation: { messages: ChatMessage[] } | undefined,
) {
  const firstUserMessage = conversation?.messages.find(
    (message) => message.role === 'user',
  );
  if (!firstUserMessage) return 'New conversation';
  return firstUserMessage.content.length > 34
    ? `${firstUserMessage.content.slice(0, 34).trim()}…`
    : firstUserMessage.content;
}

function App() {
  const conversations = useChatStore((state) => state.conversations);
  const activeId = useChatStore((state) => state.activeId);
  const startNewConversation = useChatStore(
    (state) => state.startNewConversation,
  );
  const selectConversation = useChatStore((state) => state.selectConversation);
  const submitMessage = useChatStore((state) => state.submitMessage);
  const [searchTerm, setSearchTerm] = useState('');
  const [input, setInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('providers');
  const [toast, setToast] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const chatRef = useRef<HTMLElement>(null);

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeId,
  );
  const visibleConversations = useMemo(
    () =>
      conversations.filter((conversation) =>
        getConversationTitle(conversation)
          .toLowerCase()
          .includes(searchTerm.toLowerCase()),
      ),
    [conversations, searchTerm],
  );
  const hasMessages = Boolean(activeConversation?.messages.length);
  const conversationTitle = getConversationTitle(activeConversation);

  useEffect(() => {
    if (hasMessages && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [activeId, activeConversation?.messages.length, hasMessages]);

  useEffect(() => {
    function handleShortcuts(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setSettingsOpen(false);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        startNewConversation();
        messageRef.current?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleShortcuts);
    return () => document.removeEventListener('keydown', handleShortcuts);
  }, [startNewConversation]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function showSettings() {
    setSettingsOpen(true);
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim()) return;
    submitMessage(input);
    setInput('');
    if (messageRef.current) messageRef.current.style.height = 'auto';
  }

  function handleInput(event: ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.currentTarget.value);
    event.currentTarget.style.height = 'auto';
    event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 160)}px`;
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">
            <Sparkles size={18} strokeWidth={2} />
          </div>
          <span className="brand-name">
            chanakya<span className="brand-period">.</span>
          </span>
          <button
            className="icon-button sidebar-collapse"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeft size={16} />
          </button>
        </div>
        <button
          className="new-chat-button"
          onClick={() => {
            startNewConversation();
            messageRef.current?.focus();
          }}
        >
          <Plus size={17} />
          <span>New conversation</span>
          <kbd>⌘ K</kbd>
        </button>
        <label className="search-box">
          <Search size={16} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search conversations"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <kbd>⌘ F</kbd>
        </label>
        <div className="history-area">
          <div className="section-label">YOUR SPACE</div>
          <div className="history-list">
            {visibleConversations.map((conversation) => (
              <button
                className={`history-item${conversation.id === activeId ? ' active' : ''}`}
                key={conversation.id}
                onClick={() => selectConversation(conversation.id)}
              >
                <MessageCircle size={15} />
                <span>{getConversationTitle(conversation)}</span>
                <MoreHorizontal className="history-more" size={17} />
              </button>
            ))}
          </div>
          {visibleConversations.length === 0 && (
            <div className="history-empty">
              {searchTerm
                ? 'No conversations found.'
                : 'Your conversations will appear here.'}
            </div>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="local-dot" />
            <span>Private by design</span>
          </div>
          <button className="settings-button" onClick={showSettings}>
            <Settings size={17} />
            <span>Settings</span>
            <span className="settings-shortcut">↗</span>
          </button>
          <div className="profile-row">
            <div className="avatar">N</div>
            <div className="profile-copy">
              <strong>My workspace</strong>
              <span>Local account</span>
            </div>
            <button
              className="icon-button profile-menu"
              aria-label="Workspace menu"
            >
              <MoreHorizontal size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{conversationTitle}</strong>
          </div>
          <div className="topbar-right">
            <div className="connection-state">
              <span className="state-dot" />
              <span>No provider connected</span>
            </div>
            <button className="topbar-settings" onClick={showSettings}>
              <Settings size={16} />
              <span>Settings</span>
            </button>
          </div>
        </header>
        <section className="chat-scroll" ref={chatRef}>
          {!hasMessages ? (
            <Welcome
              onConnect={showSettings}
              onSuggestion={(prompt) => {
                setInput(prompt);
                messageRef.current?.focus();
              }}
            />
          ) : (
            <div className="message-list">
              {activeConversation?.messages.map((message, index) => (
                <Message
                  key={`${activeId}-${index}`}
                  message={message}
                  onOpenSettings={showSettings}
                />
              ))}
            </div>
          )}
        </section>
        <footer className="composer-wrap">
          <form className="composer" onSubmit={sendMessage}>
            <textarea
              ref={messageRef}
              rows={1}
              placeholder="Ask anything..."
              aria-label="Message"
              value={input}
              onChange={handleInput}
              onKeyDown={handleInputKeyDown}
            />
            <div className="composer-bottom">
              <div className="composer-tools">
                <button
                  type="button"
                  className="composer-tool"
                  aria-label="Attach a file"
                  title="Attach a file"
                >
                  <Paperclip size={16} />
                </button>
                <button
                  type="button"
                  className="composer-tool"
                  aria-label="Web search"
                  title="Web search"
                >
                  <Globe size={16} />
                </button>
                <span className="tool-divider" />
                <button
                  type="button"
                  className="model-picker"
                  onClick={showSettings}
                >
                  <Circle className="model-dot" size={8} />
                  <span>No model selected</span>
                  <ChevronDown size={14} />
                </button>
              </div>
              <div className="composer-actions">
                <span className="enter-hint">Enter to send</span>
                <button
                  type="submit"
                  className="send-button"
                  aria-label="Send message"
                  title="Send message"
                >
                  <Send size={17} />
                </button>
              </div>
            </div>
          </form>
          <div className="composer-caption">
            Chanakya can make mistakes. Check important information.
          </div>
        </footer>
      </main>

      {settingsOpen && (
        <SettingsModal
          activeTab={settingsTab}
          onClose={() => setSettingsOpen(false)}
          onConnect={() =>
            setToast('Provider setup is not available in this build.')
          }
          onSelectTab={setSettingsTab}
        />
      )}
      <div className={`toast${toast ? ' visible' : ''}`} role="status">
        {toast}
      </div>
    </div>
  );
}

function Welcome({
  onConnect,
  onSuggestion,
}: {
  onConnect: () => void;
  onSuggestion: (prompt: string) => void;
}) {
  return (
    <div className="welcome">
      <div className="welcome-orb">
        <div className="orb-core">
          <Sparkles size={31} />
        </div>
        <span className="orb-glow" />
      </div>
      <div className="eyebrow">
        <span className="eyebrow-line" />A QUIETER KIND OF AI
        <span className="eyebrow-line" />
      </div>
      <h1>
        Good ideas start
        <br />
        with <span>a conversation.</span>
      </h1>
      <p className="welcome-copy">
        A thoughtful space to explore, create, and get things done.
        <br />
        What would you like to work on today?
      </p>
      <div className="suggestion-grid">
        {suggestions.map(({ title, detail, prompt, icon: Icon, tone }) => (
          <button
            className="suggestion"
            key={title}
            onClick={() => onSuggestion(prompt)}
          >
            <span className={`suggestion-icon ${tone}`}>
              <Icon size={16} />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
            <ArrowUpRight size={15} />
          </button>
        ))}
      </div>
      <button className="connect-prompt" onClick={onConnect}>
        <span className="connect-icon">
          <Zap size={15} />
        </span>
        <span>
          First time here? <strong>Connect a model provider</strong> to get
          started.
        </span>
        <ArrowUpRight size={14} />
      </button>
    </div>
  );
}

function Message({
  message,
  onOpenSettings,
}: {
  message: ChatMessage;
  onOpenSettings: () => void;
}) {
  if (message.role === 'user') {
    return (
      <article className="message-row user">
        <div className="message-avatar">N</div>
        <div className="message-content">
          <div className="message-meta">
            You <span>Just now</span>
          </div>
          <p>{message.content}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="message-row assistant">
      <div className="assistant-mark">
        <Sparkles size={17} />
      </div>
      <div className="message-content">
        <div className="message-meta">
          Chanakya <span className="error-label">Setup needed</span>
        </div>
        <div className="message-error">
          <strong>Connect a provider to get a response.</strong>
          <p>
            Your message is saved on this device. Open Settings to configure an
            AI provider when provider connections are available.
          </p>
          <button className="inline-settings" onClick={onOpenSettings}>
            <Settings size={14} /> Open settings
          </button>
        </div>
      </div>
    </article>
  );
}

function SettingsModal({
  activeTab,
  onClose,
  onConnect,
  onSelectTab,
}: {
  activeTab: SettingsTab;
  onClose: () => void;
  onConnect: () => void;
  onSelectTab: (tab: SettingsTab) => void;
}) {
  const content = {
    providers: {
      title: 'Connect a provider',
      description:
        'Your API keys stay on this device and are never shown again after saving.',
    },
    models: {
      title: 'Model preferences',
      description:
        'These preferences will be available when settings support is connected.',
    },
    general: {
      title: 'General preferences',
      description:
        'These preferences will be available when settings support is connected.',
    },
  }[activeTab];

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-heading"
      >
        <div className="modal-header">
          <div>
            <span className="modal-kicker">PREFERENCES</span>
            <h2 id="settings-heading">Settings</h2>
          </div>
          <button
            className="icon-button modal-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>
        <div className="settings-tabs">
          {(['providers', 'models', 'general'] as const).map((tab) => (
            <button
              className={`settings-tab${activeTab === tab ? ' active' : ''}`}
              key={tab}
              onClick={() => onSelectTab(tab)}
            >
              {tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="settings-content">
          <div className="settings-intro">
            <h3>{content.title}</h3>
            <p>{content.description}</p>
          </div>
          {activeTab === 'providers' && (
            <>
              <div className="provider-list">
                {providers.map((provider) => (
                  <div className="provider-card" key={provider.name}>
                    <span className={`provider-logo ${provider.tone}`}>
                      {provider.logo}
                    </span>
                    <span className="provider-info">
                      <strong>{provider.name}</strong>
                      <small>{provider.detail}</small>
                    </span>
                    <span className="provider-status">Not connected</span>
                    <button className="provider-connect" onClick={onConnect}>
                      Connect
                    </button>
                  </div>
                ))}
              </div>
              <div className="settings-notice">
                <span>
                  <Zap size={15} />
                </span>
                <p>
                  Provider connections are not available in this build yet. Your
                  credentials won&apos;t be collected or stored.
                </p>
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <span>Conversations are saved on this device</span>
          <button className="done-button" onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}

const rootElement = document.getElementById('app');
if (!rootElement) throw new Error('Missing #app root element');

createRoot(rootElement).render(<App />);
