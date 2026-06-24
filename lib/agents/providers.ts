// Multi-provider chat adapter for Pixel Agents.
// Runs the full tool-calling loop server-side for one user turn:
//   - read tools (list_accounts, get_insights) execute immediately and loop
//   - write tools (set_status, set_budget, navigate) are collected as proposals
//     and the loop stops, returning them to the client for confirmation
// Supports Anthropic (/v1/messages) and OpenAI (/chat/completions) via raw fetch.
import crypto from "node:crypto";
import { TOOLS, READ_TOOLS, WRITE_TOOLS, runReadTool } from "./tools";
import type { Agent, ChatMessage, ProposedAction, ToolSource } from "./types";

const MAX_ITERATIONS = 6;

const ANTHROPIC_DEFAULT_MODEL = "claude-opus-4-8";
const OPENAI_DEFAULT_MODEL = "gpt-4o";

interface NormalizedToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
}

function systemPrompt(agent: Agent): string {
  const base =
    agent.systemPrompt?.trim() ||
    "You are an ads-operations agent. Analyze Facebook ad performance and help the user act on it.";
  const scope = agent.scope.accountId === "all"
    ? `You are responsible for ALL ad accounts (the whole dashboard). Use list_accounts to discover them, and pass accountId to get_insights to target a specific one.`
    : `You are scoped to ad account "${agent.scope.accountId || "(none set)"}". Only read or act on this account.`;
  return (
    `${base}\n\n` +
    `${scope} ` +
    `Use the read tools to gather data before answering. You have a full optimizer toolkit:\n` +
    `- get_insights returns the COMPLETE metric set (ROAS, CPL, frequency, CTR, CPM, CPC, link CTR, landing page views, add-to-cart, checkout, and the video funnel 25→100%). Set compare=true to get the previous equal-length period with % deltas — do this whenever the user asks "how are we doing", "what changed", or to spot regressions.\n` +
    `- get_breakdown splits a metric by placement, publisher platform, device, age, gender, region, or day. Reach for it to find waste (a placement/age/region with poor ROAS or high CPL) and winners worth scaling.\n` +
    `Diagnose, don't just report: when ROAS drops, check whether it's frequency (fatigue), CPM (auction/audience), CTR (creative), or conversion rate (offer/landing). Judge metrics against the user's stated targets when given.\n` +
    `When you want to pause/activate ads or change budgets, call the write tools — they will be shown to the user for confirmation, so always include a clear "summary" citing the numbers that justify it. ` +
    `Be concise.`
  );
}

// ── Anthropic ───────────────────────────────────────────────────────────────

async function anthropicTurn(agent: Agent, transcript: ChatMessage[]) {
  const model = agent.model || ANTHROPIC_DEFAULT_MODEL;
  const tools = TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  // Build the message list from the simple transcript (text turns only).
  const messages: any[] = transcript
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  const proposals: ProposedAction[] = [];
  const sources: ToolSource[] = [];
  let finalText = "";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": agent.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: 4096, system: systemPrompt(agent), tools, messages }),
    });
    const data = await res.json();
    if (data.error) throw new Error(`Anthropic: ${data.error.message}`);

    const content: any[] = data.content || [];
    for (const block of content) if (block.type === "text") finalText += block.text;

    const toolUses = content.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0 || data.stop_reason !== "tool_use") break;

    // Echo the assistant turn (including tool_use blocks) back.
    messages.push({ role: "assistant", content });

    const toolResults: any[] = [];
    let stopForProposals = false;
    for (const tu of toolUses) {
      if (WRITE_TOOLS.has(tu.name)) {
        proposals.push(toProposal(tu.name, tu.input));
        stopForProposals = true;
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: "Proposed to the user for confirmation; awaiting their decision.",
        });
      } else if (READ_TOOLS.has(tu.name)) {
        try {
          const out = await runReadTool(tu.name, tu.input, agent.scope.accountId);
          sources.push({ id: crypto.randomBytes(5).toString("hex"), tool: tu.name, args: tu.input, result: out });
          toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
        } catch (e: any) {
          toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: `Error: ${e.message}`, is_error: true });
        }
      }
    }
    messages.push({ role: "user", content: toolResults });
    if (stopForProposals) break;
  }

  return { text: finalText.trim(), proposals, sources };
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

async function openaiTurn(agent: Agent, transcript: ChatMessage[]) {
  const model = agent.model || OPENAI_DEFAULT_MODEL;
  const tools = TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));

  const messages: any[] = [
    { role: "system", content: systemPrompt(agent) },
    ...transcript
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content })),
  ];

  const proposals: ProposedAction[] = [];
  const sources: ToolSource[] = [];
  let finalText = "";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${agent.apiKey}` },
      body: JSON.stringify({ model, messages, tools, tool_choice: "auto" }),
    });
    const data = await res.json();
    if (data.error) throw new Error(`OpenAI: ${data.error.message}`);

    const msg = data.choices?.[0]?.message;
    if (!msg) break;
    if (msg.content) finalText += msg.content;

    const calls = msg.tool_calls || [];
    if (calls.length === 0) break;

    messages.push(msg); // echo assistant tool_calls turn

    let stopForProposals = false;
    for (const c of calls) {
      const name = c.function?.name;
      let args: Record<string, any> = {};
      try { args = JSON.parse(c.function?.arguments || "{}"); } catch { /* ignore */ }

      if (WRITE_TOOLS.has(name)) {
        proposals.push(toProposal(name, args));
        stopForProposals = true;
        messages.push({ role: "tool", tool_call_id: c.id, content: "Proposed to the user for confirmation; awaiting their decision." });
      } else if (READ_TOOLS.has(name)) {
        try {
          const out = await runReadTool(name, args, agent.scope.accountId);
          sources.push({ id: crypto.randomBytes(5).toString("hex"), tool: name, args, result: out });
          messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out) });
        } catch (e: any) {
          messages.push({ role: "tool", tool_call_id: c.id, content: `Error: ${e.message}` });
        }
      }
    }
    if (stopForProposals) break;
  }

  return { text: finalText.trim(), proposals, sources };
}

function toProposal(tool: string, args: Record<string, any>): ProposedAction {
  const { summary, ...rest } = args || {};
  return {
    id: crypto.randomBytes(6).toString("hex"),
    tool: tool as ProposedAction["tool"],
    args: rest,
    summary: String(summary || `${tool} ${JSON.stringify(rest)}`),
  };
}

export async function runAgentTurn(
  agent: Agent,
  transcript: ChatMessage[],
): Promise<{ text: string; proposals: ProposedAction[]; sources: ToolSource[] }> {
  if (!agent.apiKey) throw new Error("agent has no API key configured");
  return agent.provider === "openai" ? openaiTurn(agent, transcript) : anthropicTurn(agent, transcript);
}

// Lightweight credential check used by the "Test key" button at creation time.
export async function testApiKey(provider: string, model: string, apiKey: string): Promise<void> {
  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: model || OPENAI_DEFAULT_MODEL, max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
  } else {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: model || ANTHROPIC_DEFAULT_MODEL, max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
  }
}
