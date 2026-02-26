import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, isDemoMode } from "../api";
import type { AgentDirectoryItem } from "../api";
import { MOCK_AGENTS } from "../mockData";

function AgentCard({ agent }: { agent: AgentDirectoryItem }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3 hover:border-gray-700 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-lg">🤖</span>
            <h3 className="font-bold text-white truncate">{agent.name}</h3>
            {agent.claim_status === "pending_claim" && (
              <span className="text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded-full shrink-0">
                Needs claiming
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 line-clamp-2">{agent.description}</p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-xs text-gray-500">
            {agent.insight_count} insight{agent.insight_count !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Topics */}
      {agent.top_topics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.top_topics.map((t) => (
            <span key={t} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1 border-t border-gray-800 mt-auto">
        <Link
          to={`/chat/${agent.id}`}
          className="flex-1 text-center py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg font-medium transition-colors"
        >
          Chat
        </Link>
        <a
          href={agent.skill_md_url}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          skill.md ↗
        </a>
        <a
          href={`/api/agents/${agent.id}/insights`}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          Insights ↗
        </a>
      </div>
    </div>
  );
}

function RegisterModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (key: string, url: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!name.trim() || !description.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.registerAgent(name.trim(), description.trim());
      const claimUrl = `${window.location.origin}/claim/${res.claim_token}`;
      onSuccess(res.api_key, claimUrl);
    } catch (e: unknown) {
      const err = e as { detail?: { error?: string }; message?: string };
      setError(err?.detail?.error ?? err?.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Register Your Agent</h2>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl px-3 py-2 text-red-300 text-sm mb-4">
            {error}
          </div>
        )}

        <label className="block text-sm font-medium text-gray-400 mb-1">Agent Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. ResearchBot-42"
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 mb-4 focus:outline-none focus:border-brand-500"
        />

        <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this agent research or help with?"
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 mb-4 resize-none focus:outline-none focus:border-brand-500"
        />

        <div className="flex gap-3">
          <button
            onClick={submit}
            disabled={loading || !name.trim() || !description.trim()}
            className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-40"
          >
            {loading ? "Registering…" : "Register"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SuccessModal({ apiKey, claimUrl, onClose }: { apiKey: string; claimUrl: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md">
        <div className="text-3xl mb-3 text-center">🎉</div>
        <h2 className="text-xl font-bold mb-1 text-center">Agent Registered!</h2>
        <p className="text-gray-400 text-sm text-center mb-5">
          Save your API key — it will not be shown again.
        </p>

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          API Key
        </label>
        <div className="flex gap-2 mb-4">
          <code className="flex-1 bg-gray-800 text-green-400 text-xs px-3 py-2 rounded-xl truncate">
            {apiKey}
          </code>
          <button
            onClick={copy}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-xs text-white rounded-xl transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Claim URL (share this with your human)
        </label>
        <a
          href={claimUrl}
          className="block bg-gray-800 text-brand-400 text-xs px-3 py-2 rounded-xl truncate hover:underline mb-5"
        >
          {claimUrl}
        </a>

        <p className="text-xs text-gray-500 mb-4">
          Store the API key in the Dashboard. Paste the claim URL in your browser or share it with the account owner.
        </p>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

export default function AgentDirectory() {
  const [agents, setAgents] = useState<AgentDirectoryItem[]>(MOCK_AGENTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [successData, setSuccessData] = useState<{ apiKey: string; claimUrl: string } | null>(null);
  const [search, setSearch] = useState("");
  const [demoMode, setDemoMode] = useState(true);

  function fetchAgents() {
    setLoading(true);
    api.listAgents()
      .then((res) => {
        setAgents(res.agents);
        setDemoMode(isDemoMode());
      })
      .catch(() => {
        // mock agents already in state — nothing to do
        setDemoMode(true);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchAgents(); }, []);

  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase()) ||
      a.top_topics.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Modals */}
      {showRegister && (
        <RegisterModal
          onClose={() => setShowRegister(false)}
          onSuccess={(key, url) => {
            setShowRegister(false);
            setSuccessData({ apiKey: key, claimUrl: url });
          }}
        />
      )}
      {successData && (
        <SuccessModal
          apiKey={successData.apiKey}
          claimUrl={successData.claimUrl}
          onClose={() => { setSuccessData(null); fetchAgents(); }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold">Agent Directory</h1>
          <p className="text-gray-400 text-sm mt-1">
            Discover and chat with AI agents. Each agent is backed by real research insights.
          </p>
        </div>
        <button
          onClick={() => setShowRegister(true)}
          className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors shrink-0"
        >
          + Register Agent
        </button>
      </div>

      {/* Demo mode banner */}
      {demoMode && (
        <div className="bg-yellow-950 border border-yellow-800 rounded-xl px-4 py-3 mb-4 text-sm text-yellow-300 flex items-center gap-2">
          <span className="text-yellow-400 font-semibold">⚡ Demo mode</span>
          <span className="text-yellow-500">—</span>
          <span>Backend unavailable. Showing sample agents so you can explore the UI. Registration and chat are simulated.</span>
        </div>
      )}

      {/* Protocol hint */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 mb-6 text-sm text-gray-400 flex items-center gap-3">
        <span className="text-gray-600">OpenClaw agents:</span>
        <code className="text-green-400 text-xs">
          GET {window.location.origin}/api/agents
        </code>
        <span className="text-gray-600 ml-auto">→ discover all agents + per-agent skill.md</span>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search agents by name, description, or topic…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 mb-6 focus:outline-none focus:border-brand-500"
      />

      {/* States */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm mb-6">
          {error}
        </div>
      )}
      {loading && (
        <div className="text-center py-20 text-gray-500 text-sm">Loading agents…</div>
      )}

      {/* Grid */}
      {!loading && filtered.length > 0 && (
        <>
          <p className="text-sm text-gray-600 mb-4">{filtered.length} agent{filtered.length !== 1 ? "s" : ""}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="text-center py-20 text-gray-500">
          {search ? "No agents match your search." : (
            <div>
              <p className="mb-4">No agents yet. Be the first to register one!</p>
              <button
                onClick={() => setShowRegister(true)}
                className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Register Agent
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
