/**
 * operator/alert.ts
 * -----------------------------------------------------------------------------
 * Alerts for things a person has to look at: a posted result that doesn't match
 * the recompute (the guardian has until the end of the challenge window to veto
 * it), a vetoed result, a transaction that keeps failing, or a duty running late.
 *
 * Every alert is logged. With ALERT_WEBHOOK_URL set it is also posted there; the
 * body carries both `text` (Slack) and `content` (Discord). The same alert is not
 * posted again for six hours.
 */
import type { ServiceState } from "./state.ts";

const REPEAT_AFTER_SECONDS = 6 * 60 * 60;

export async function alert(
  state: ServiceState,
  webhookUrl: string | undefined,
  key: string,
  message: string,
): Promise<void> {
  console.warn(`[alert] ${message}`);
  const now = Math.floor(Date.now() / 1000);
  const last = state.alerted[key];
  if (last !== undefined && now - last < REPEAT_AFTER_SECONDS) return;
  state.alerted[key] = now;
  if (!webhookUrl) return;

  const text = `Qualyra: ${message}`;
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, content: text }),
    });
    if (!response.ok) console.warn(`[alert] webhook answered ${response.status}`);
  } catch (error) {
    console.warn(`[alert] webhook unreachable: ${(error as Error).message}`);
  }
}
