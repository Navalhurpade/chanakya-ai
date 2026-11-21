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
  Square,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import type {
  Provider,
  ProviderKind,
  ProviderSettings,
  SaveProviderInput,
} from './shared/provider-contracts';
import type { AgentEvent, ChatPromptMessage } from './shared/chat-contracts';
import type { ChatMessage } from './stores/chat-store';
import { useChatStore } from './stores/chat-store';
import './index.css';

type SettingsTab = 'providers' | 'models' | 'general';
type ActiveChatRun = {
  runId: string;
  conversationId: string;
  assistantMessageId: string;
};

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

const providerKinds: {
  kind: ProviderKind;
  name: string;
  defaultModel: string;
}[] = [
  { kind: 'google', name: 'Google Gemini', defaultModel: 'gemini-2.5-flash' },
  { kind: 'groq', name: 'Groq', defaultModel: 'llama-3.3-70b-versatile' },
  {
    kind: 'openrouter',
    name: 'OpenRouter',
    defaultModel: 'openai/gpt-4o-mini',
  },
  { kind: 'openai', name: 'OpenAI', defaultModel: 'gpt-4o-mini' },
  {
    kind: 'anthropic',
    name: 'Anthropic',
    defaultModel: 'claude-3-7-sonnet-latest',
  },
  {
    kind: 'custom',
    name: 'OpenAI-compatible',
    defaultModel: '',
  },
];

const initialProviderSettings: ProviderSettings = {
  providers: [],
  selectedProviderId: null,
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

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
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>(
    initialProviderSettings,
  );
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [activeRun, setActiveRun] = useState<ActiveChatRun | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const chatRef = useRef<HTMLElement>(null);
  const activeRunRef = useRef<ActiveChatRun | null>(null);

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeId,
  );
  const selectedProviderId =
    activeConversation?.providerId ?? providerSettings.selectedProviderId;
  const selectedProvider = providerSettings.providers.find(
    (provider) => provider.id === selectedProviderId && provider.enabled,
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

  useLayoutEffect(() => {
    const textarea = messageRef.current;
    if (!textarea) return;
    const maxHeight = 160;
    textarea.style.height = 'auto';
    textarea.style.overflowY = 'hidden';
    const contentHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`;
    textarea.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
  }, [input]);

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

  useEffect(() => {
    function handleAgentEvent(event: AgentEvent) {
      const run = activeRunRef.current;
      if (!run || run.runId !== event.runId) return;
      const store = useChatStore.getState();
      switch (event.type) {
        case 'message-started':
          break;
        case 'text-delta':
          store.appendAssistantDelta(
            event.conversationId,
            event.assistantMessageId,
            event.delta,
          );
          break;
        case 'message-completed':
          store.completeAssistantMessage(
            event.conversationId,
            event.assistantMessageId,
          );
          activeRunRef.current = null;
          setActiveRun(null);
          break;
        case 'error':
          store.failAssistantMessage(
            event.conversationId,
            event.assistantMessageId,
            event.message,
          );
          activeRunRef.current = null;
          setActiveRun(null);
          break;
        case 'generation-cancelled':
          store.cancelAssistantMessage(
            event.conversationId,
            event.assistantMessageId,
          );
          activeRunRef.current = null;
          setActiveRun(null);
          break;
      }
    }

    return window.chanakya.chat.subscribe(handleAgentEvent);
  }, []);

  useEffect(() => {
    let active = true;
    window.chanakya.providers
      .list()
      .then((settings) => {
        if (active) setProviderSettings(settings);
      })
      .catch((error: unknown) => {
        if (active) setSettingsError(getErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, []);

  async function showSettings() {
    setSettingsOpen(true);
    setSettingsLoading(true);
    setSettingsError('');
    try {
      setProviderSettings(await window.chanakya.providers.list());
    } catch (error) {
      setSettingsError(getErrorMessage(error));
    } finally {
      setSettingsLoading(false);
    }
  }

  async function chooseProvider(providerId: string | null) {
    try {
      const settings = await window.chanakya.providers.select(providerId);
      setProviderSettings(settings);
      if (activeId && providerId) {
        const provider = settings.providers.find(
          (item) => item.id === providerId,
        );
        if (provider) {
          useChatStore.getState().setConversationProvider(activeId, provider);
        }
      }
      setModelMenuOpen(false);
    } catch (error) {
      setToast(getErrorMessage(error));
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim() || activeRunRef.current) return;
    const submitted = submitMessage(
      input,
      selectedProvider
        ? { id: selectedProvider.id, model: selectedProvider.model }
        : null,
    );
    setInput('');
    if (messageRef.current) messageRef.current.style.height = 'auto';
    if (!submitted || !selectedProvider) return;

    const run: ActiveChatRun = {
      runId: crypto.randomUUID(),
      conversationId: submitted.conversationId,
      assistantMessageId: submitted.assistantMessageId,
    };
    activeRunRef.current = run;
    setActiveRun(run);
    try {
      const conversation = useChatStore
        .getState()
        .conversations.find((item) => item.id === submitted.conversationId);
      const messages =
        conversation?.messages
          .filter(
            (message) =>
              message.id !== submitted.assistantMessageId &&
              (message.role === 'user' ||
                message.role === 'assistant' ||
                message.role === 'system') &&
              message.status !== 'error' &&
              message.status !== 'cancelled' &&
              message.content.length > 0,
          )
          .map(
            (message): ChatPromptMessage => ({
              role: message.role === 'user' ? 'user' : 'assistant',
              content: message.content,
            }),
          ) ?? [];
      await window.chanakya.chat.sendMessage({
        ...run,
        providerId: selectedProvider.id,
        messages,
      });
    } catch (error) {
      useChatStore
        .getState()
        .failAssistantMessage(
          run.conversationId,
          run.assistantMessageId,
          getErrorMessage(error),
        );
      if (activeRunRef.current?.runId === run.runId) {
        activeRunRef.current = null;
        setActiveRun(null);
      }
    }
  }

  async function stopGeneration() {
    const run = activeRunRef.current;
    if (!run) return;
    try {
      await window.chanakya.chat.cancelRun(run.runId);
    } catch (error) {
      setToast(getErrorMessage(error));
    }
  }

  function handleInput(event: ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.currentTarget.value);
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
              <span>
                {selectedProvider
                  ? `Using ${selectedProvider.name}`
                  : 'No model selected'}
              </span>
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
                  key={message.id ?? `${activeId}-${index}`}
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
                  onClick={() => setModelMenuOpen((open) => !open)}
                  aria-expanded={modelMenuOpen}
                >
                  <Circle
                    className={`model-dot${selectedProvider ? ' selected' : ''}`}
                    size={8}
                  />
                  <span>
                    {selectedProvider
                      ? `${selectedProvider.name} · ${selectedProvider.model}`
                      : 'No model selected'}
                  </span>
                  <ChevronDown size={14} />
                </button>
                {modelMenuOpen && (
                  <div className="model-dropdown" role="menu">
                    {providerSettings.providers
                      .filter((provider) => provider.enabled)
                      .map((provider) => (
                        <button
                          className="model-option"
                          key={provider.id}
                          onClick={() => void chooseProvider(provider.id)}
                          role="menuitem"
                        >
                          <span>{provider.name}</span>
                          <small>{provider.model}</small>
                          {provider.id === selectedProviderId && (
                            <span className="model-current">Current</span>
                          )}
                        </button>
                      ))}
                    <button
                      className="model-configure"
                      onClick={() => {
                        setModelMenuOpen(false);
                        void showSettings();
                      }}
                    >
                      <Plus size={14} /> Configure providers
                    </button>
                  </div>
                )}
              </div>
              <div className="composer-actions">
                {activeRun ? (
                  <button
                    type="button"
                    className="send-button stop-button"
                    aria-label="Stop generation"
                    title="Stop generation"
                    onClick={() => void stopGeneration()}
                  >
                    <Square size={13} fill="currentColor" />
                  </button>
                ) : (
                  <>
                    <span className="enter-hint">Enter to send</span>
                    <button
                      type="submit"
                      className="send-button"
                      aria-label="Send message"
                      title="Send message"
                    >
                      <Send size={17} />
                    </button>
                  </>
                )}
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
          settings={providerSettings}
          loading={settingsLoading}
          error={settingsError}
          onClose={() => setSettingsOpen(false)}
          onSelectTab={setSettingsTab}
          onSettingsChange={setProviderSettings}
          onSelectProvider={(providerId) => void chooseProvider(providerId)}
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
          Chanakya
          {message.status === 'streaming' && (
            <span className="streaming-label">Generating</span>
          )}
        </div>
        {message.content && <p className="assistant-text">{message.content}</p>}
        {message.status === 'streaming' && !message.content && (
          <div className="streaming-indicator">
            <span />
            <span />
            <span />
            <small>Thinking</small>
          </div>
        )}
        {message.status === 'error' && (
          <div className="message-error">
            <strong>Couldn&apos;t generate a response.</strong>
            <p>{message.error}</p>
            {message.error?.includes('model is selected') && (
              <button className="inline-settings" onClick={onOpenSettings}>
                <Settings size={14} /> Open settings
              </button>
            )}
          </div>
        )}
        {message.status === 'cancelled' && (
          <div className="generation-cancelled">{message.error}</div>
        )}
      </div>
    </article>
  );
}

function SettingsModal({
  activeTab,
  settings,
  loading,
  error,
  onClose,
  onSelectTab,
  onSettingsChange,
  onSelectProvider,
}: {
  activeTab: SettingsTab;
  settings: ProviderSettings;
  loading: boolean;
  error: string;
  onClose: () => void;
  onSelectTab: (tab: SettingsTab) => void;
  onSettingsChange: (settings: ProviderSettings) => void;
  onSelectProvider: (providerId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  async function saveProvider(input: SaveProviderInput) {
    setSaving(true);
    setActionError('');
    try {
      onSettingsChange(await window.chanakya.providers.save(input));
      setCreating(false);
      setEditingProvider(null);
    } catch (saveError) {
      setActionError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function removeProvider(providerId: string) {
    setActionError('');
    try {
      onSettingsChange(await window.chanakya.providers.delete(providerId));
    } catch (removeError) {
      setActionError(getErrorMessage(removeError));
    }
  }

  async function updateEnabled(provider: Provider, enabled: boolean) {
    setActionError('');
    try {
      onSettingsChange(
        await window.chanakya.providers.setEnabled(provider.id, enabled),
      );
    } catch (updateError) {
      setActionError(getErrorMessage(updateError));
    }
  }

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
          {activeTab === 'providers' && (
            <section className="settings-section">
              <div className="settings-intro">
                <div>
                  <h3>Provider configurations</h3>
                  <p>
                    API keys are encrypted with your operating system&apos;s
                    secure credential storage. Saved keys are never sent back to
                    the UI.
                  </p>
                </div>
                <button
                  className="provider-connect add-provider"
                  onClick={() => {
                    setActionError('');
                    setEditingProvider(null);
                    setCreating(true);
                  }}
                >
                  <Plus size={14} /> Add provider
                </button>
              </div>
              {(error || actionError) && (
                <div className="settings-error">{actionError || error}</div>
              )}
              {loading ? (
                <div className="settings-loading">Loading providers…</div>
              ) : settings.providers.length === 0 && !creating ? (
                <div className="provider-empty">
                  <Sparkles size={18} />
                  <strong>No providers configured</strong>
                  <span>Add a provider to choose a model.</span>
                </div>
              ) : (
                <div className="provider-list">
                  {settings.providers.map((provider) => (
                    <div className="provider-card" key={provider.id}>
                      <div className="provider-card-main">
                        <span className={`provider-logo ${provider.kind}`}>
                          {providerKinds
                            .find((item) => item.kind === provider.kind)
                            ?.name.slice(0, 1) ?? 'P'}
                        </span>
                        <span className="provider-info">
                          <strong>{provider.name}</strong>
                          <small>{provider.model}</small>
                        </span>
                        <span className="provider-status">
                          {!provider.enabled
                            ? 'Disabled'
                            : provider.hasApiKey
                              ? 'Key saved'
                              : 'No API key'}
                        </span>
                      </div>
                      <div className="provider-actions">
                        <button
                          className="provider-action"
                          onClick={() => onSelectProvider(provider.id)}
                          disabled={
                            !provider.enabled ||
                            settings.selectedProviderId === provider.id
                          }
                        >
                          {settings.selectedProviderId === provider.id
                            ? 'Selected'
                            : 'Use model'}
                        </button>
                        <button
                          className="provider-action"
                          onClick={() => {
                            setActionError('');
                            setCreating(false);
                            setEditingProvider(provider);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="provider-action"
                          onClick={() =>
                            void updateEnabled(provider, !provider.enabled)
                          }
                        >
                          {provider.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          className="provider-action danger"
                          onClick={() => void removeProvider(provider.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(creating || editingProvider) && (
                <ProviderForm
                  provider={editingProvider ?? undefined}
                  saving={saving}
                  error={actionError}
                  onCancel={() => {
                    setCreating(false);
                    setEditingProvider(null);
                    setActionError('');
                  }}
                  onSave={saveProvider}
                />
              )}
            </section>
          )}
          {activeTab === 'models' && (
            <section className="settings-section">
              <div className="settings-intro">
                <h3>Choose a model</h3>
                <p>
                  Select a configured provider and model for new conversations.
                </p>
              </div>
              {error && <div className="settings-error">{error}</div>}
              {settings.providers.filter((provider) => provider.enabled)
                .length === 0 ? (
                <div className="provider-empty">
                  <span>No enabled models yet.</span>
                  <button
                    className="inline-settings"
                    onClick={() => onSelectTab('providers')}
                  >
                    Configure a provider
                  </button>
                </div>
              ) : (
                <div className="model-settings-list">
                  {settings.providers
                    .filter((provider) => provider.enabled)
                    .map((provider) => (
                      <button
                        className={`model-setting-option${settings.selectedProviderId === provider.id ? ' active' : ''}`}
                        key={provider.id}
                        onClick={() => onSelectProvider(provider.id)}
                      >
                        <span className="model-setting-copy">
                          <strong>{provider.name}</strong>
                          <small>{provider.model}</small>
                        </span>
                        <span className="model-setting-status">
                          {settings.selectedProviderId === provider.id
                            ? 'Current model'
                            : 'Select'}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </section>
          )}
          {activeTab === 'general' && (
            <section className="settings-section">
              <div className="settings-intro">
                <h3>Local data</h3>
                <p>
                  Conversations are saved in this app on this device. Provider
                  credentials are stored separately using OS encryption.
                </p>
              </div>
            </section>
          )}
        </div>
        <div className="modal-footer">
          <span>API keys are encrypted by your operating system</span>
          <button className="done-button" onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'string')
  );
}

function ProviderForm({
  provider,
  saving,
  error,
  onCancel,
  onSave,
}: {
  provider?: Provider;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSave: (input: SaveProviderInput) => Promise<void>;
}) {
  const initialKind = provider?.kind ?? 'google';
  const defaults = providerKinds.find((item) => item.kind === initialKind);
  const [kind, setKind] = useState<ProviderKind>(initialKind);
  const [name, setName] = useState(provider?.name ?? defaults?.name ?? '');
  const [model, setModel] = useState(
    provider?.model ?? defaults?.defaultModel ?? '',
  );
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '');
  const [customHeaders, setCustomHeaders] = useState('');
  const [enabled, setEnabled] = useState(provider?.enabled ?? true);
  const [allowPrivateNetwork, setAllowPrivateNetwork] = useState(
    provider?.allowPrivateNetwork ?? false,
  );
  const [formError, setFormError] = useState('');

  function changeKind(nextKind: ProviderKind) {
    const nextDefaults = providerKinds.find((item) => item.kind === nextKind);
    setKind(nextKind);
    setName(nextDefaults?.name ?? '');
    setModel(nextDefaults?.defaultModel ?? '');
    if (nextKind !== 'custom') setBaseUrl('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    let parsedHeaders: Record<string, string> | undefined;
    if (customHeaders.trim()) {
      try {
        const parsed: unknown = JSON.parse(customHeaders);
        if (!isStringRecord(parsed)) {
          setFormError(
            'Custom headers must be a JSON object with string values.',
          );
          return;
        }
        parsedHeaders = parsed;
      } catch {
        setFormError('Enter custom headers as valid JSON.');
        return;
      }
    }

    const input: SaveProviderInput = {
      ...(provider ? { id: provider.id } : {}),
      kind,
      name,
      model,
      enabled,
      allowPrivateNetwork,
      ...(kind === 'custom' ? { baseUrl } : {}),
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      ...(parsedHeaders ? { customHeaders: parsedHeaders } : {}),
    };
    await onSave(input);
  }

  return (
    <form className="provider-form" onSubmit={submit}>
      <div className="provider-form-heading">
        <div>
          <span className="modal-kicker">
            {provider ? 'EDIT PROVIDER' : 'NEW PROVIDER'}
          </span>
          <h3>{provider ? 'Update configuration' : 'Add a provider'}</h3>
        </div>
        <button
          type="button"
          className="icon-button modal-close"
          onClick={onCancel}
          aria-label="Close provider form"
        >
          <X size={16} />
        </button>
      </div>
      <label className="settings-field">
        Provider
        <select
          value={kind}
          onChange={(event) => changeKind(event.target.value as ProviderKind)}
        >
          {providerKinds.map((option) => (
            <option value={option.kind} key={option.kind}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <div className="provider-form-grid">
        <label className="settings-field">
          Display name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My provider"
          />
        </label>
        <label className="settings-field">
          Model identifier
          <input
            required
            maxLength={160}
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="e.g. gemini-2.5-flash"
          />
        </label>
      </div>
      {kind === 'custom' && (
        <>
          <label className="settings-field">
            API base URL
            <input
              required
              type="url"
              maxLength={2048}
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.example.com/v1"
            />
          </label>
          <label className="private-network-option">
            <input
              type="checkbox"
              checked={allowPrivateNetwork}
              onChange={(event) => setAllowPrivateNetwork(event.target.checked)}
            />
            <span>
              Allow a local/private network endpoint
              <small>
                Only enable this for a self-hosted endpoint you trust.
              </small>
            </span>
          </label>
        </>
      )}
      <label className="settings-field">
        API key {provider?.hasApiKey && <span>(saved securely)</span>}
        <input
          type="password"
          autoComplete="new-password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            provider?.hasApiKey
              ? 'Saved securely · leave blank to keep'
              : kind === 'custom'
                ? 'Optional for local endpoints'
                : 'Paste your API key'
          }
          required={!provider?.hasApiKey && kind !== 'custom'}
        />
      </label>
      <label className="settings-field">
        Custom headers (optional JSON)
        <textarea
          rows={2}
          value={customHeaders}
          onChange={(event) => setCustomHeaders(event.target.value)}
          placeholder={
            provider?.hasCustomHeaders
              ? 'Saved securely · leave blank to keep, enter {} to clear'
              : '{"X-Provider-Header": "value"}'
          }
        />
      </label>
      <label className="private-network-option enabled-option">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span>Enable this provider</span>
      </label>
      {(formError || error) && (
        <div className="settings-error">{formError || error}</div>
      )}
      <div className="provider-form-actions">
        <button
          type="button"
          className="provider-action"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button type="submit" className="done-button" disabled={saving}>
          {saving ? 'Saving…' : 'Save provider'}
        </button>
      </div>
    </form>
  );
}

const rootElement = document.getElementById('app');
if (!rootElement) throw new Error('Missing #app root element');

createRoot(rootElement).render(<App />);
