import { useEffect, useRef, useState } from "react";
import { Clock3, CircleDot, LoaderCircle, Send, ShieldCheck, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { base44 } from "@/api/base44Client";
import { AgentIcon } from "../../components/icons.jsx";
import { relativeDate } from "../../lib/dates.js";
import { messageText, THINKING_STAGES, SEND_TIMEOUT_MS } from "../../lib/agentMessages.js";
import { useStagedMessage } from "../../hooks/useStagedMessage.js";
import MagpieMark from "../../components/MagpieMark.jsx";

const markdownComponents = {
  table: (props) => <div className="md-table-scroll"><table {...props} /></div>,
  a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
};

export default function MagpieAgentPanel({ project, collection, record, onClose }) {
  const [conversation, setConversation] = useState(null);
  const [input, setInput] = useState("");
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState(null);
  const [error, setError] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const thinkingLabel = useStagedMessage(isSending, THINKING_STAGES);
  const sendTimeoutRef = useRef(null);

  const clearSendTimeout = () => {
    if (sendTimeoutRef.current) {
      clearTimeout(sendTimeoutRef.current);
      sendTimeoutRef.current = null;
    }
  };
  // Stops the waiting UI without discarding the user's own message bubble --
  // the request may already have gone through server-side, just slowly, so
  // pulling the message back would make it look lost when it might not be.
  const stopWaiting = (message) => {
    clearSendTimeout();
    setIsSending(false);
    if (message) setError(message);
  };

  useEffect(() => () => clearSendTimeout(), []);

  useEffect(() => {
    let active = true;
    // No `q` filter here: this local environment's listConversations
    // silently returns zero results whenever a `q: { agent_name: ... }`
    // filter is passed, even though matching conversations exist (verified
    // directly against a live conversation with getConversations()). Since
    // this app only ever creates conversations for magpie_organizer, fetch
    // unfiltered and filter client-side instead of trusting the server-side
    // filter.
    base44.agents.listConversations({ sort: "-updated_date", limit: 5 })
      .then((conversations) => {
        if (active) setConversation(conversations.find((item) => item.agent_name === "magpie_organizer") ?? null);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Could not load Magpie Agent conversations.");
      })
      .finally(() => {
        if (active) setIsLoadingConversation(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!conversation?.id) return undefined;
    return base44.agents.subscribeToConversation(conversation.id, (updatedConversation) => {
      setConversation(updatedConversation);
      const latest = updatedConversation.messages?.at(-1);
      const runningTool = latest?.tool_calls?.some((tool) =>
        tool.status === "running" || tool.status === "waiting_for_user_input"
      );
      if (latest?.role === "assistant" && !runningTool) {
        clearSendTimeout();
        setIsSending(false);
        setPendingUserMessage(null);
      } else if (latest?.role === "user") {
        // The realtime push already carries our own message back to us --
        // drop the optimistic echo (if it's the one that just landed) so it
        // isn't shown twice while we keep waiting on the assistant's reply.
        // Uses the functional form since this callback's closure is fixed
        // at subscribe time and won't see later `pendingUserMessage` updates.
        setPendingUserMessage((current) => (current && messageText(latest.content) === current.content ? null : current));
      }
    });
  }, [conversation?.id]);

  const createConversation = async () => {
    const created = await base44.agents.createConversation({
      agent_name: "magpie_organizer",
      metadata: {
        surface: "dashboard",
        project_id: project?.id ?? null,
        collection_id: collection?.id ?? null,
        record_id: record?.id ?? null,
      },
    });
    setConversation(created);
    return created;
  };

  const startNewConversation = async () => {
    setError("");
    setIsHistoryOpen(false);
    stopWaiting();
    setPendingUserMessage(null);
    setIsLoadingConversation(true);
    try {
      await createConversation();
    } catch (createError) {
      setError(createError.message || "The Magpie Agent is not available in this environment yet.");
    } finally {
      setIsLoadingConversation(false);
    }
  };

  const openHistory = async () => {
    setIsHistoryOpen(true);
    setIsLoadingHistory(true);
    setError("");
    try {
      // See the mount-time load above: the `q` filter unreliably returns
      // zero results here, so fetch unfiltered and filter client-side.
      const list = await base44.agents.listConversations({ sort: "-updated_date", limit: 25 });
      setHistory(list.filter((item) => item.agent_name === "magpie_organizer"));
    } catch (historyError) {
      setError(historyError.message || "Could not load conversation history.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const resumeConversation = async (conversationId) => {
    if (conversationId === conversation?.id) {
      setIsHistoryOpen(false);
      return;
    }
    setError("");
    setIsHistoryOpen(false);
    stopWaiting();
    setPendingUserMessage(null);
    setIsLoadingConversation(true);
    try {
      const full = await base44.agents.getConversation(conversationId);
      setConversation(full ?? null);
    } catch (resumeError) {
      setError(resumeError.message || "Could not load that conversation.");
    } finally {
      setIsLoadingConversation(false);
    }
  };

  const sendMessage = async (event, suggestedText) => {
    event?.preventDefault();
    const content = (suggestedText ?? input).trim();
    if (!content || isSending) return;
    setError("");
    setIsSending(true);
    setInput("");
    const pendingId = `pending-${Date.now()}`;
    setPendingUserMessage({ id: pendingId, role: "user", content });
    clearSendTimeout();
    sendTimeoutRef.current = setTimeout(() => {
      stopWaiting("Magpie is taking longer than expected to reply. Your message was sent — wait a moment or try again.");
    }, SEND_TIMEOUT_MS);
    // Clears the optimistic bubble only if it's still the one this call
    // created -- if the send timed out and a later message was already
    // sent, a slow/late resolution here must not clobber that newer bubble.
    const clearOwnPending = () => setPendingUserMessage((current) => (current?.id === pendingId ? null : current));
    try {
      const activeConversation = conversation ?? await createConversation();
      // addMessage()'s resolved value is not reliably the user's own echoed
      // message (it can be the assistant's reply once the turn completes) --
      // don't guess its shape. Once it resolves, the turn is done either
      // way, so re-fetch the authoritative full conversation via
      // getConversation() (documented as the complete stored conversation,
      // unlike the realtime subscription's truncated shape) rather than
      // hand-merging a value of uncertain identity into local state.
      await base44.agents.addMessage(activeConversation, {
        role: "user",
        content,
        custom_context: [{
          type: "magpie_dashboard_selection",
          message: "The user is currently viewing this Magpie dashboard context.",
          data: {
            project_id: project?.id ?? null,
            project_title: project?.title ?? null,
            collection_id: collection?.id ?? null,
            collection_name: collection?.name ?? null,
            record_id: record?.id ?? null,
          },
        }],
      });
      const full = await base44.agents.getConversation(activeConversation.id);
      setConversation(full ?? activeConversation);
      clearSendTimeout();
      setIsSending(false);
      clearOwnPending();
    } catch (sendError) {
      clearSendTimeout();
      setIsSending(false);
      clearOwnPending();
      setInput(content);
      setError(sendError.message || "Magpie could not answer right now.");
    }
  };

  const realMessages = (conversation?.messages ?? []).filter((message) =>
    !message.hidden && (message.role === "user" || message.role === "assistant") &&
    messageText(message.content)
  );
  const lastReal = realMessages.at(-1);
  const pendingAlreadyLanded = pendingUserMessage && lastReal?.role === "user" && messageText(lastReal.content) === pendingUserMessage.content;
  const messages = pendingUserMessage && !pendingAlreadyLanded ? [...realMessages, pendingUserMessage] : realMessages;
  const contextLabel = record
    ? "Current Item"
    : collection
    ? collection.name
    : project
    ? project.title
    : "All Collections";

  return (
    <div className="agent-overlay" role="presentation" onMouseDown={onClose}>
      <aside className="agent-panel" role="dialog" aria-modal="true" aria-label="Ask Magpie" onMouseDown={(event) => event.stopPropagation()}>
        <header className="agent-head">
          <div className="agent-title">
            <MagpieMark size={32} />
            <div><div className="eyebrow"><AgentIcon size={12} /> evidence-grounded agent</div><h2>Ask Magpie</h2></div>
          </div>
          <div className="agent-head-actions">
            <button
              className={`icon-button${isHistoryOpen ? " active" : ""}`}
              onClick={() => (isHistoryOpen ? setIsHistoryOpen(false) : openHistory())}
              aria-label="Conversation history"
              title="Conversation history"
            >
              <Clock3 size={16} />
            </button>
            <button className="agent-new-button" onClick={startNewConversation} disabled={isLoadingConversation}>New chat</button>
            <button className="icon-button" onClick={onClose} aria-label="Close Magpie Agent"><X size={19} /></button>
          </div>
        </header>
        <div className="agent-context"><CircleDot size={12} /><span>Context: {contextLabel}</span></div>

        {isHistoryOpen ? (
          <section className="agent-history" aria-label="Conversation history">
            {isLoadingHistory ? (
              <div className="agent-loading"><LoaderCircle className="spin" size={19} /> Loading history…</div>
            ) : history.length ? history.map((item) => {
              const last = (item.messages ?? []).filter((message) => !message.hidden && messageText(message.content)).at(-1);
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`agent-history-row${item.id === conversation?.id ? " active" : ""}`}
                  onClick={() => resumeConversation(item.id)}
                >
                  <span className="agent-history-preview">{last ? messageText(last.content) : "New conversation"}</span>
                  <span className="agent-history-date">{relativeDate(item.updated_date)}</span>
                </button>
              );
            }) : (
              <div className="agent-history-empty">No past conversations with Magpie yet.</div>
            )}
          </section>
        ) : (
        <section className="agent-messages" aria-live="polite">
          {isLoadingConversation ? (
            <div className="agent-loading"><LoaderCircle className="spin" size={19} /> Loading conversation…</div>
          ) : messages.length ? messages.map((message) => (
            <div className={`agent-message ${message.role}${message === pendingUserMessage ? " is-pending" : ""}`} key={message.id}>
              <span>{message.role === "assistant" ? "Magpie" : "You"}</span>
              {message.role === "assistant" ? (
                <div className="agent-md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {messageText(message.content)}
                  </ReactMarkdown>
                </div>
              ) : (
                <p>{messageText(message.content)}</p>
              )}
            </div>
          )) : (
            <div className="agent-welcome">
              <MagpieMark size={46} />
              <h3>Turn your captures into a decision.</h3>
              <p>I can explain organization, compare Items across stored evidence, and configure explicit watches.</p>
              <div className="agent-suggestions">
                <button onClick={(event) => sendMessage(event, "What is in my workspace, and what needs my attention?")}>Summarize my workspace</button>
                <button onClick={(event) => sendMessage(event, "Explain how the current Items are organized.")}>Explain organization</button>
                <button onClick={(event) => sendMessage(event, "Which Items can I meaningfully compare right now?")}>Find comparisons</button>
              </div>
            </div>
          )}
          {isSending && (
            <div className="agent-thinking">
              <LoaderCircle className="spin" size={14} /> {thinkingLabel}
              <button type="button" className="text-button" onClick={() => stopWaiting()}>Cancel</button>
            </div>
          )}
        </section>
        )}

        {error && <div className="agent-error">{error}</div>}
        {!isHistoryOpen && <form className="agent-composer" onSubmit={sendMessage}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) sendMessage(event);
            }}
            placeholder="Ask about your Projects, Collections, Items, or watches…"
            rows="2"
            aria-label="Message Magpie Agent"
          />
          <button type="submit" disabled={!input.trim() || isSending} aria-label="Send message"><Send size={17} /></button>
        </form>}
        <footer className="agent-foot"><ShieldCheck size={12} /> Owner-scoped tools. No direct database authority.</footer>
      </aside>
    </div>
  );
}
