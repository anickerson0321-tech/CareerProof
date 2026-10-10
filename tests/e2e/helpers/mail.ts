// Reads sign-in emails from the local Supabase stack's Mailpit inbox.

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

interface MailpitSearch {
  messages: { ID: string; Created: string }[];
}

interface MailpitMessage {
  Text: string;
  HTML: string;
}

export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Waits for the newest email to `address` and returns the sign-in link in it. */
export async function signInLinkFor(address: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
    if (search.ok) {
      const { messages } = (await search.json()) as MailpitSearch;
      const newest = messages[0];
      if (newest) {
        const message = (await (await fetch(`${MAILPIT}/api/v1/message/${newest.ID}`)).json()) as MailpitMessage;
        const link = extractLink(message.Text) ?? extractLink(decodeEntities(message.HTML));
        if (link) return link;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No sign-in email arrived for ${address}`);
}

function extractLink(body: string): string | null {
  const match = /https?:\/\/[^\s"'<>)]+\/auth\/v1\/verify[^\s"'<>)]*/.exec(body);
  return match ? match[0] : null;
}

function decodeEntities(html: string): string {
  return html.replace(/&amp;/g, "&").replace(/&#43;/g, "+").replace(/&#x3D;/g, "=");
}
