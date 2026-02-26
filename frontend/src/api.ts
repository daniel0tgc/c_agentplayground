export const BACKEND_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
const BASE = `${BACKEND_URL}/api`;

// Tracks whether the last listAgents call fell back to mock data
let _demoMode = false;
export const isDemoMode = () => _demoMode;

export interface InsightContent {
  problem: string;
  solution: string;
  source_ref?: string;
}

export interface InsightMetadata {
  agent_id: string;
  verification_count: number;
  timestamp: string;
  tags: string[];
}

export interface Insight {
  id: string;
  topic: string;
  phase: string;
  content: InsightContent;
  metadata: InsightMetadata;
  created_at: string;
  score?: number;
}

export interface BlockerItem {
  topic: string;
  query_count: number;
  verified_insight_count: number;
  blocker_score: number;
}

export interface BlockersResponse {
  blockers: BlockerItem[];
}

export interface ChatMessageOut {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface AgentStep {
  label: string;
  status: "done" | "active" | "failed";
}

export interface PendingPost {
  content_type: "insight" | "summary" | "idea";
  topic: string;
  phase: string;
  problem: string;
  solution: string;
  source_ref: string;
  tags: string[];
}

export interface ChatResponse {
  reply: string;
  conversation_id: string;
  session_id: string;
  messages: ChatMessageOut[];
  steps: AgentStep[];
  pending_post: PendingPost | null;
}

export interface AgentDirectoryItem {
  id: string;
  name: string;
  description: string;
  claim_status: string;
  insight_count: number;
  top_topics: string[];
  skill_md_url: string;
  heartbeat_md_url: string;
  skill_json_url: string;
  chat_url: string;
  created_at: string;
}

export interface AgentDirectoryResponse {
  agents: AgentDirectoryItem[];
  total: number;
}

async function get<T>(path: string, apiKey?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function post<T>(path: string, body: unknown, apiKey?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw Object.assign(new Error(res.statusText), { status: res.status, detail: err.detail });
  }
  return res.json();
}

import {
  MOCK_AGENTS_RESPONSE,
  mockSendChat,
  mockRegisterAgent,
  mockGetChatHistory,
  mockClearChatHistory,
} from "./mockData";

export const api = {
  listInsights: (apiKey: string, params?: { limit?: number; topic?: string; phase?: string }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.topic) q.set("topic", params.topic);
    if (params?.phase) q.set("phase", params.phase);
    const qs = q.toString() ? `?${q}` : "";
    return get<Insight[]>(`/insights${qs}`, apiKey);
  },

  searchSemantic: (apiKey: string, query: string, topK = 5) =>
    get<{ query: string; results: Insight[]; total: number }>(
      `/search/semantic?q=${encodeURIComponent(query)}&top_k=${topK}`,
      apiKey
    ),

  getBlockers: (apiKey: string, limit = 10) =>
    get<BlockersResponse>(`/status/blockers?limit=${limit}`, apiKey),

  verifyInsight: (apiKey: string, id: string) =>
    post<{ id: string; verification_count: number; message: string }>(
      `/insights/${id}/verify`,
      {},
      apiKey
    ),

  claimAgent: (token: string, ownerEmail?: string) =>
    post<{ id: string; name: string; claim_status: string; owner_email?: string }>(
      `/agents/claim/${token}`,
      { owner_email: ownerEmail }
    ),

  registerAgent: (name: string, description: string) =>
    post<{
      id: string;
      name: string;
      description: string;
      api_key: string;
      claim_token: string;
      claim_status: string;
      claim_url: string;
    }>("/agents/register", { name, description }).catch(() => mockRegisterAgent(name, description)),

  listAgents: () =>
    get<AgentDirectoryResponse>("/agents").then((res) => {
      _demoMode = false;
      return res;
    }).catch(() => {
      _demoMode = true;
      return MOCK_AGENTS_RESPONSE;
    }),

  getAgentInsights: (agentId: string) =>
    get<{ agent_id: string; total: number; insights: Insight[] }>(`/agents/${agentId}/insights`),

  sendChat: (agentId: string, message: string, sessionId?: string) =>
    post<ChatResponse>(`/chat/${agentId}`, { message, session_id: sessionId ?? null }).catch(
      () => mockSendChat(agentId, message, sessionId)
    ),

  getChatHistory: (agentId: string, sessionId: string) =>
    get<{ conversation_id: string; session_id: string; agent_id: string; messages: ChatMessageOut[] }>(
      `/chat/${agentId}/history?session_id=${encodeURIComponent(sessionId)}`
    ).catch(() => mockGetChatHistory(agentId, sessionId)),

  clearChatHistory: async (agentId: string, sessionId: string) => {
    try {
      await fetch(`${BASE}/chat/${agentId}/history?session_id=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
    } catch {
      mockClearChatHistory(sessionId);
    }
  },

  confirmPost: (agentId: string, pendingPost: PendingPost, sessionId?: string) =>
    post<ChatResponse>(`/chat/${agentId}/confirm`, {
      pending_post: pendingPost,
      session_id: sessionId ?? null,
    }),
};
