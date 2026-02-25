import { useState, useEffect } from "react";
import { api } from "../api";
import type { BlockerItem, Insight } from "../api";
import BlockerChart from "../components/BlockerChart";

export default function KnowledgeMap() {
  const [apiKey] = useState(() => localStorage.getItem("ap_apikey") ?? "");
  const [blockers, setBlockers] = useState<BlockerItem[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!apiKey) return;
    setLoading(true);
    Promise.all([
      api.getBlockers(apiKey, 15),
      api.listInsights(apiKey, { limit: 100 }),
    ])
      .then(([blockersRes, insightsRes]) => {
        setBlockers(blockersRes.blockers);
        setInsights(insightsRes);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [apiKey]);

  // Aggregate stats
  const topicCounts: Record<string, { total: number; verified: number }> = {};
  for (const ins of insights) {
    if (!topicCounts[ins.topic]) topicCounts[ins.topic] = { total: 0, verified: 0 };
    topicCounts[ins.topic].total += 1;
    if (ins.metadata.verification_count > 0) topicCounts[ins.topic].verified += 1;
  }

  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 12);

  const totalInsights = insights.length;
  const verifiedInsights = insights.filter((i) => i.metadata.verification_count > 0).length;
  const totalVerifications = insights.reduce((s, i) => s + i.metadata.verification_count, 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Knowledge Map</h1>
      <p className="text-gray-400 mb-8 text-sm">
        Visual overview of what's well-documented and what's still a blocker.
      </p>

      {!apiKey && (
        <div className="text-center py-20 text-gray-500">
          Enter your API key on the Dashboard to view the knowledge map.
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm mb-6">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-20 text-gray-500 text-sm">Loading…</div>
      )}

      {!loading && apiKey && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: "Total Insights", value: totalInsights, color: "text-brand-400" },
              { label: "Verified Insights", value: verifiedInsights, color: "text-green-400" },
              { label: "Total Verifications", value: totalVerifications, color: "text-yellow-400" },
            ].map((stat) => (
              <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
                <div className={`text-3xl font-bold ${stat.color} mb-1`}>{stat.value}</div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Blockers chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
            <h2 className="text-lg font-semibold mb-1">🚨 Class Blockers</h2>
            <p className="text-xs text-gray-500 mb-4">
              Topics with high search volume but few verified solutions. Higher score = more urgent.
            </p>
            <BlockerChart blockers={blockers} />
          </div>

          {/* Topic coverage grid */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-1">📚 Topic Coverage</h2>
            <p className="text-xs text-gray-500 mb-4">
              Size of bar = number of insights. Green fill = verified portion.
            </p>
            {topTopics.length === 0 ? (
              <p className="text-gray-500 text-sm">No insights posted yet.</p>
            ) : (
              <div className="space-y-3">
                {topTopics.map(([topic, counts]) => {
                  const verifiedPct = counts.total > 0 ? (counts.verified / counts.total) * 100 : 0;
                  return (
                    <div key={topic}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-300 truncate max-w-xs">{topic}</span>
                        <span className="text-gray-500 shrink-0 ml-2">
                          {counts.verified}/{counts.total} verified
                        </span>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-600 rounded-full relative overflow-hidden"
                          style={{
                            width: `${Math.max(4, (counts.total / (topTopics[0][1].total || 1)) * 100)}%`,
                          }}
                        >
                          <div
                            className="absolute inset-y-0 left-0 bg-green-500"
                            style={{ width: `${verifiedPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex gap-4 mt-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm bg-brand-600 inline-block" /> Insights posted
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm bg-green-500 inline-block" /> Verified
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
