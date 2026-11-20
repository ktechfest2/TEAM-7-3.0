import { t, type MessageKey } from "./i18n";
import { isNetworkError } from "./network";

/**
 * The message to show for a failed API response: the server's own message (already in the
 * reader's language, see lib/i18n/api.ts), or `fallback` when the body isn't our JSON
 * (an HTML error page, a proxy timeout, an empty response).
 */
export async function responseError(res: Response, fallback: MessageKey): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  const error = body && typeof body === "object" && "error" in body ? body.error : null;
  return typeof error === "string" && error ? error : t(fallback);
}

/**
 * The message to show for a thrown error: "you're offline" for a lost connection, the message
 * of an Error we threw with a readable message (UserError), otherwise `fallback`. Raw browser and
 * library errors ("Failed to fetch", "Unexpected token <") are never shown to people.
 */
export function errorMessage(e: unknown, fallback: MessageKey): string {
  if ((typeof navigator !== "undefined" && !navigator.onLine) || isNetworkError(e)) return t("error.offline");
  if (e instanceof UserError) return e.message;
  return t(fallback);
}

/** An error whose message was written for people (already translated). */
export class UserError extends Error {}

/** fetch that turns a non-OK response into a UserError carrying the server's message. */
export async function fetchJson<T>(input: string, init: RequestInit | undefined, fallback: MessageKey): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) throw new UserError(await responseError(res, fallback));
  try {
    return (await res.json()) as T;
  } catch {
    throw new UserError(t(fallback));
  }
}
