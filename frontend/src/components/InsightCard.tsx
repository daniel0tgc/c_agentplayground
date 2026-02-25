import { useState } from "react";
import type { Insight } from "../api";
import { api } from "../api";

const PHASE_COLORS: Record<string, string> = {
  Setup: "bg-blue-900 text-blue-300",
  Implementation: "bg-purple-900 text-purple-300",
  Optimization: "bg-green-900 text-green-300",
  Debug: "bg-orange-900 text-orange-300",
  Other: "bg-gray-800 text-gray-300",
};

interface Props {
  insight: Insight;
  apiKey?: string;
  onVerified?: (id: string, newCount: number) => void;
}

export default function InsightCard({ insight, apiKey, onVerified }: Props) {
  const [verifying, setVerifying] = useState(false);
  const [verCount, setVerCount] = useState(insight.metadata.verification_count);
  const [verifyMsg, setVerifyMsg] = useState("");

  const phaseClass = PHASE_COLORS[insight.phase] ?? PHASE_COLORS.Other;

  async function handleVerify() {
    if (!apiKey) return;
    setVerifying(true);
    try {
      const res = await api.verifyInsight(apiKey, insight.id);
      setVerCount(res.verification_count);
      setVerifyMsg("Verified ✓");
      onVerified?.(insight.id, res.verification_count);
    } catch (e: unknown) {
      const err = e as { detail?: { error?: string } };
      setVerifyMsg(err?.detail?.error ?? "Error verifying");
    } finally {
      setVerifying(false);
      setTimeout(() => setVerifyMsg(""), 3000);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3 hover:border-gray-700 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mr-2 ${phaseClass}`}>
            {insight.phase}
          </span>
          <span className="font-semibold text-white">{insight.topic}</span>
        </div>
        {insight.score !== undefined && (
          <span className="text-xs text-brand-400 font-mono shrink-0">
            {(insight.score * 100).toFixed(0)}% match
          </span>
        )}
      </div>

      {/* Problem */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Problem</p>
        <p className="text-gray-300 text-sm leading-relaxed">{insight.content.problem}</p>
      </div>

      {/* Solution */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Solution</p>
        <p className="text-gray-200 text-sm leading-relaxed">{insight.content.solution}</p>
      </div>

      {/* Source */}
      {insight.content.source_ref && (
        <a
          href={insight.content.source_ref}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-brand-400 hover:underline truncate"
        >
          {insight.content.source_ref}
        </a>
      )}

      {/* Tags */}
      {insight.metadata.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {insight.metadata.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-800 mt-1">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>✅ {verCount} verified</span>
          <span>·</span>
          <span>{new Date(insight.created_at).toLocaleDateString()}</span>
        </div>
        {apiKey && (
          <div className="flex items-center gap-2">
            {verifyMsg && <span className="text-xs text-green-400">{verifyMsg}</span>}
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="text-xs px-3 py-1 rounded-lg bg-gray-800 hover:bg-green-900 hover:text-green-300 text-gray-400 transition-colors disabled:opacity-50"
            >
              {verifying ? "…" : "Verify"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
