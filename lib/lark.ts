// Lark (Feishu) custom-bot webhook client.
//
// Setup: in a Lark group → Settings → Bots → Add Bot → Custom Bot → copy its
// webhook URL into LARK_WEBHOOK_URL. If you enable "Signature verification" on the
// bot, also set LARK_WEBHOOK_SECRET. No Lark app / credentials needed.
//
// Every send is a no-op (returns { ok:false, skipped:true }) when LARK_WEBHOOK_URL is
// unset, so the rest of the app is unaffected until Lark is configured.
import crypto from "node:crypto";

const WEBHOOK = process.env.LARK_WEBHOOK_URL || "";
const SECRET = process.env.LARK_WEBHOOK_SECRET || "";
/** Public base URL of the dashboard, used to build "Open" buttons. Optional. */
export const APP_BASE_URL = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

export function larkConfigured(): boolean {
  return Boolean(WEBHOOK);
}

// Lark signed-bot algorithm: key = `${timestamp}\n${secret}`, data = empty, HMAC-SHA256 → base64.
function sign(timestamp: number): { timestamp: string; sign: string } {
  const stringToSign = `${timestamp}\n${SECRET}`;
  const s = crypto.createHmac("sha256", stringToSign).update("").digest("base64");
  return { timestamp: String(timestamp), sign: s };
}

export type LarkPayload =
  | { msg_type: "text"; content: { text: string } }
  | { msg_type: "interactive"; card: LarkCard };

export interface LarkCard {
  config?: { wide_screen_mode?: boolean };
  header?: { title: { tag: "plain_text"; content: string }; template?: LarkColor };
  elements: unknown[];
}

export type LarkColor = "blue" | "green" | "red" | "grey" | "orange" | "turquoise" | "yellow";

/** POST a raw payload to the Lark webhook. Returns {ok, skipped?, status?, error?}. Never throws. */
export async function sendLark(payload: LarkPayload): Promise<{ ok: boolean; skipped?: boolean; status?: number; error?: string }> {
  if (!WEBHOOK) return { ok: false, skipped: true };
  const body: Record<string, unknown> = { ...payload };
  if (SECRET) Object.assign(body, sign(Math.floor(Date.now() / 1000)));
  try {
    const res = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    // Lark returns { code: 0, ... } on success, or { code: <non-zero>, msg } on failure.
    const code = (json as { code?: number }).code;
    if (!res.ok || (code != null && code !== 0)) {
      return { ok: false, status: res.status, error: (json as { msg?: string }).msg || `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── card builders ─────────────────────────────────────────────────────────────

export function text(content: string): LarkPayload {
  return { msg_type: "text", content: { text: content } };
}

/** A markdown div element (Lark `lark_md` supports **bold**, line breaks, [text](url)). */
export function md(content: string): { tag: "div"; text: { tag: "lark_md"; content: string } } {
  return { tag: "div", text: { tag: "lark_md", content } };
}

export const hr = { tag: "hr" } as const;

/** A row of link buttons. */
export function buttons(items: { text: string; url: string; type?: "default" | "primary" | "danger" }[]) {
  return {
    tag: "action",
    actions: items.map((b) => ({
      tag: "button",
      text: { tag: "plain_text", content: b.text },
      url: b.url,
      type: b.type || "default",
    })),
  };
}

export function card(title: string, elements: unknown[], color: LarkColor = "blue"): LarkPayload {
  return {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      header: { title: { tag: "plain_text", content: title }, template: color },
      elements,
    },
  };
}
