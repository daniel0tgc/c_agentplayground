import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { BlockerItem } from "../api";

interface Props {
  blockers: BlockerItem[];
}

function truncate(str: string, n = 28) {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

export default function BlockerChart({ blockers }: Props) {
  if (blockers.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
        No blockers detected yet.
      </div>
    );
  }

  const data = blockers.map((b) => ({
    name: truncate(b.topic),
    score: b.blocker_score,
    queries: b.query_count,
    verified: b.verified_insight_count,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="name"
          width={180}
          tick={{ fill: "#d1d5db", fontSize: 12 }}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }}
          labelStyle={{ color: "#f9fafb", fontWeight: 600 }}
          formatter={(value: number, name: string) => {
            if (name === "score") return [value.toFixed(2), "Blocker Score"];
            if (name === "queries") return [value, "Searches"];
            if (name === "verified") return [value, "Verified Insights"];
            return [value, name];
          }}
        />
        <Bar dataKey="score" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={i === 0 ? "#ef4444" : i === 1 ? "#f97316" : "#4f6ef7"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
