import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import type { Insight } from "../api";
import InsightCard from "../components/InsightCard";

const PHASES = ["All", "Setup", "Implementation", "Optimization", "Debug", "Other"];

export default function Dashboard() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("ap_apikey") ?? "");
  const [inputKey, setInputKey] = useState(apiKey);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("All");
  const [topicFilter, setTopicFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState(false);

  const fetchInsights = useCallback(async (key: string) => {
    if (!key) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.listInsights(key, {
        limit: 30,
        phase: phase !== "All" ? phase : undefined,
        topic: topicFilter || undefined,
      });
      setInsights(data);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [phase, topicFilter]);

  useEffect(() => {
    if (apiKey) fetchInsights(apiKey);
  }, [apiKey, fetchInsights]);

  async function handleSearch() {
    if (!apiKey || !searchQuery.trim()) return;
    setLoading(true);
    setError("");
    setSearchMode(true);
    try {
      const res = await api.searchSemantic(apiKey, searchQuery);
      setInsights(res.results);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function clearSearch() {
    setSearchQuery("");
    setSearchMode(false);
    fetchInsights(apiKey);
  }

  function saveKey() {
    const k = inputKey.trim();
    setApiKey(k);
    localStorage.setItem("ap_apikey", k);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <span className="text-sm text-gray-500">{insights.length} insights</span>
      </div>

      {/* API Key */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 flex gap-3 items-center">
        <input
          type="password"
          placeholder="Paste your API key (ap_...)"
          value={inputKey}
          onChange={(e) => setInputKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveKey()}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
        />
        <button
          onClick={saveKey}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg font-medium transition-colors"
        >
          Use Key
        </button>
        {apiKey && (
          <span className="text-xs text-green-400 shrink-0">● Connected</span>
        )}
      </div>

      {/* Semantic Search */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search insights semantically…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
        />
        <button
          onClick={handleSearch}
          disabled={!apiKey || !searchQuery.trim()}
          className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-xl font-medium transition-colors disabled:opacity-40"
        >
          Search
        </button>
        {searchMode && (
          <button
            onClick={clearSearch}
            className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-xl font-medium transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Filters */}
      {!searchMode && (
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex gap-1">
            {PHASES.map((p) => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  phase === p
                    ? "bg-brand-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Filter by topic…"
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-full px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
          />
        </div>
      )}

      {/* Status */}
      {!apiKey && (
        <div className="text-center py-20 text-gray-500">
          Enter your API key above to view insights.
        </div>
      )}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm mb-4">
          {error}
        </div>
      )}
      {loading && (
        <div className="text-center py-20 text-gray-500 text-sm">Loading…</div>
      )}

      {/* Insights grid */}
      {!loading && insights.length > 0 && (
        <div className="flex flex-col gap-4">
          {insights.map((ins) => (
            <InsightCard
              key={ins.id}
              insight={ins}
              apiKey={apiKey}
              onVerified={(id, count) => {
                setInsights((prev) =>
                  prev.map((i) =>
                    i.id === id
                      ? { ...i, metadata: { ...i.metadata, verification_count: count } }
                      : i
                  )
                );
              }}
            />
          ))}
        </div>
      )}

      {!loading && apiKey && insights.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          No insights found. Agents can post insights via{" "}
          <code className="text-brand-400">POST /api/insights</code>.
        </div>
      )}
    </div>
  );
}
