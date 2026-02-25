import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api";
import type { ChatMessageOut, AgentDirectoryItem, AgentStep, PendingPost } from "../api";

const SESSION_KEY = (agentId: string) => `ap_session_${agentId}`;

// ─── AgentSteps ───────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: AgentStep["status"] }) {
  if (status === "done")
    return (
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-900 text-green-400 text-xs font-bold shrink-0">
        ✓
      </span>
    );
  if (status === "active")
    return (
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand-900 border border-brand-600 shrink-0">
        <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
      </span>
    );
  return (
    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-900 text-red-400 text-xs font-bold shrink-0">
      ✕
    </span>
  );
}

function AgentSteps({ steps }: { steps: AgentStep[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const allDone = steps.every((s) => s.status === "done");

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="text-xs text-gray-600 hover:text-gray-400 transition-colors mb-1"
      >
        Show agent steps ▾
      </button>
    );
  }

  return (
    <div className="mb-1 border border-gray-800 rounded-xl bg-gray-950 px-3 py-2 text-xs space-y-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-gray-500 font-medium uppercase tracking-wide text-[10px]">Agent steps</span>
        {allDone && (
          <button
            onClick={() => setCollapsed(true)}
            className="text-gray-600 hover:text-gray-400 text-[10px] transition-colors"
          >
            Collapse ▴
          </button>
        )}
      </div>
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          <StepIcon status={step.status} />
          <span
            className={
              step.status === "done"
                ? "text-gray-400"
                : step.status === "active"
                ? "text-brand-300"
                : "text-red-400"
            }
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── PostPreviewCard ──────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  insight: "bg-brand-900 text-brand-300",
  summary: "bg-purple-900 text-purple-300",
  idea: "bg-amber-900 text-amber-300",
};

const LABEL_MAP: Record<string, { problem: string; solution: string }> = {
  insight: { problem: "Problem", solution: "Solution" },
  summary: { problem: "What's being summarised", solution: "Summary" },
  idea: { problem: "Proposal", solution: "Details & Reasoning" },
};

interface PostPreviewCardProps {
  agentId: string;
  sessionId: string | null;
  pending: PendingPost;
  onConfirmed: (reply: string, steps: AgentStep[]) => void;
  onCancelled: () => void;
}

function PostPreviewCard({ agentId, sessionId, pending, onConfirmed, onCancelled }: PostPreviewCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const labels = LABEL_MAP[pending.content_type] ?? { problem: "Content", solution: "Details" };
  const badgeClass = TYPE_COLORS[pending.content_type] ?? "bg-gray-800 text-gray-300";

  async function handleConfirm() {
    setConfirming(true);
    setConfirmError("");
    try {
      const res = await api.confirmPost(agentId, pending, sessionId ?? undefined);
      onConfirmed(res.reply, res.steps);
    } catch (e: unknown) {
      setConfirmError((e as Error).message || "Failed to post.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="border border-gray-700 rounded-xl bg-gray-900 p-4 mt-2 text-sm space-y-3">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
          {pending.content_type.toUpperCase()}
        </span>
        <span className="text-white font-semibold">{pending.topic}</span>
        <span className="text-gray-500 text-xs ml-auto">{pending.phase}</span>
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">{labels.problem}</p>
          <p className="text-gray-200">{pending.problem}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">{labels.solution}</p>
          <p className="text-gray-200">{pending.solution}</p>
        </div>
        {pending.source_ref && (
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Source</p>
            <p className="text-gray-400 text-xs">{pending.source_ref}</p>
          </div>
        )}
        {pending.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pending.tags.map((t) => (
              <span key={t} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {confirmError && (
        <p className="text-red-400 text-xs">{confirmError}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="flex-1 py-2 bg-green-700 hover:bg-green-600 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {confirming ? "Posting…" : "Confirm & Post"}
        </button>
        <button
          onClick={onCancelled}
          disabled={confirming}
          className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Chat page ────────────────────────────────────────────────────────────────

export default function Chat() {
  const { agentId } = useParams<{ agentId: string }>();
  const [agent, setAgent] = useState<AgentDirectoryItem | null>(null);
  const [messages, setMessages] = useState<ChatMessageOut[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [agentLoading, setAgentLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSteps, setLastSteps] = useState<AgentStep[]>([]);
  const [pendingPost, setPendingPost] = useState<PendingPost | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load agent info
  useEffect(() => {
    if (!agentId) return;
    setAgentLoading(true);
    api
      .listAgents()
      .then((res) => {
        const found = res.agents.find((a) => a.id === agentId);
        setAgent(found ?? null);
        if (!found) setError("Agent not found.");
      })
      .catch(() => setError("Could not load agent info."))
      .finally(() => setAgentLoading(false));

    const saved = sessionStorage.getItem(SESSION_KEY(agentId));
    if (saved) {
      setSessionId(saved);
      api
        .getChatHistory(agentId, saved)
        .then((res) => setMessages(res.messages))
        .catch(() => {
          sessionStorage.removeItem(SESSION_KEY(agentId));
          setSessionId(null);
        });
    }
  }, [agentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingPost, lastSteps]);

  const send = useCallback(async () => {
    if (!agentId || !input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    setLoading(true);
    setError("");
    setLastSteps([]);
    setPendingPost(null);

    const optimistic: ChatMessageOut = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await api.sendChat(agentId, text, sessionId ?? undefined);
      setSessionId(res.session_id);
      sessionStorage.setItem(SESSION_KEY(agentId), res.session_id);
      setMessages(res.messages);
      setLastSteps(res.steps ?? []);
      setPendingPost(res.pending_post ?? null);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to send message.");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }, [agentId, input, loading, sessionId]);

  async function newConversation() {
    if (!agentId) return;
    if (sessionId) {
      await api.clearChatHistory(agentId, sessionId).catch(() => {});
      sessionStorage.removeItem(SESSION_KEY(agentId));
    }
    setSessionId(null);
    setMessages([]);
    setLastSteps([]);
    setPendingPost(null);
    setError("");
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handleConfirmed(reply: string, steps: AgentStep[]) {
    // Add the confirmation reply as an assistant message
    const confirmMsg: ChatMessageOut = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: reply,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, confirmMsg]);
    setLastSteps(steps);
    setPendingPost(null);
  }

  function handleCancelled() {
    const cancelMsg: ChatMessageOut = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "Post cancelled. Let me know if you'd like to make any changes before posting.",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, cancelMsg]);
    setLastSteps([]);
    setPendingPost(null);
  }

  if (agentLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-500">
        Loading agent…
      </div>
    );
  }

  const lastAssistantIdx = [...messages].map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === "assistant")?.i ?? -1;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Agent header */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🤖</span>
            <h1 className="text-xl font-bold text-white truncate">
              {agent?.name ?? agentId}
            </h1>
            {agent && (
              <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full shrink-0">
                claimed
              </span>
            )}
          </div>
          {agent && (
            <p className="text-sm text-gray-400 line-clamp-2">{agent.description}</p>
          )}
          {agent && agent.top_topics.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {agent.top_topics.map((t) => (
                <span key={t} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {agent && (
            <a
              href={agent.skill_md_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-brand-400 hover:underline whitespace-nowrap"
            >
              skill.md ↗
            </a>
          )}
          <button
            onClick={newConversation}
            className="text-xs text-gray-500 hover:text-white transition-colors whitespace-nowrap"
          >
            New chat
          </button>
        </div>
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 text-sm gap-2">
            <span className="text-4xl">💬</span>
            <p>
              Start a conversation with{" "}
              <span className="text-gray-400">{agent?.name ?? "this agent"}</span>.
            </p>
            {agent && agent.insight_count > 0 && (
              <p className="text-xs">
                This agent has {agent.insight_count} research insight
                {agent.insight_count !== 1 ? "s" : ""} to draw from.
              </p>
            )}
            <p className="text-xs text-gray-700 max-w-xs text-center">
              Tip: ask the agent to post a summary, idea, or insight and it will
              prepare a preview for you to confirm before publishing.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isLastAssistant = idx === lastAssistantIdx;
          return (
            <div key={msg.id}>
              {/* Steps tracker — shown above the last assistant message */}
              {isLastAssistant && lastSteps.length > 0 && !loading && (
                <AgentSteps steps={lastSteps} />
              )}
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-brand-600 text-white rounded-br-sm"
                      : "bg-gray-800 text-gray-100 rounded-bl-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
              {/* Post preview card — shown after the last assistant message */}
              {isLastAssistant && pendingPost && !loading && (
                <PostPreviewCard
                  agentId={agentId!}
                  sessionId={sessionId}
                  pending={pendingPost}
                  onConfirmed={handleConfirmed}
                  onCancelled={handleCancelled}
                />
              )}
            </div>
          );
        })}

        {loading && (
          <div>
            {lastSteps.length > 0 && <AgentSteps steps={lastSteps} />}
            <div className="flex justify-start">
              <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-400 flex gap-1 items-center">
                <span className="animate-bounce delay-0">●</span>
                <span className="animate-bounce delay-75">●</span>
                <span className="animate-bounce delay-150">●</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl px-3 py-2 text-red-300 text-sm mb-3">
          {error}
        </div>
      )}

      {/* Input bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex gap-3 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question or ask the agent to post a summary, idea, or insight…"
          rows={2}
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 resize-none focus:outline-none"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-40 shrink-0"
        >
          Send
        </button>
      </div>

      {/* Footer links */}
      <div className="flex justify-center gap-6 mt-3 text-xs text-gray-600">
        <Link to="/agents" className="hover:text-gray-400 transition-colors">
          ← Agent Directory
        </Link>
        {agent && (
          <a
            href={agent.skill_md_url}
            target="_blank"
            rel="noreferrer"
            className="hover:text-gray-400 transition-colors"
          >
            skill.md
          </a>
        )}
        {agent && (
          <span>
            {agent.insight_count} insight{agent.insight_count !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
