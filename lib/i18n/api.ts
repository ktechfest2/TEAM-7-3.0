import { t, type MessageKey } from "./index";
import { isLang, LANG_COOKIE, negotiateLang, type Lang } from "./langs";

/**
 * The reader's language inside an API route. Fetches from the app send the `lang` cookie the
 * language menu sets; otherwise the browser's Accept-Language decides, as for pages (proxy.ts).
 */
export function requestLangOf(req: Request): Lang {
  const cookie = req.headers.get("cookie") ?? "";
  const saved = cookie.match(new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=([^;]+)`))?.[1];
  return isLang(saved) ? saved : negotiateLang(req.headers.get("accept-language"));
}

/** t() bound to the language of this request, so API error messages reach people in their language. */
export function apiT(req: Request) {
  const lang = requestLangOf(req);
  return (key: MessageKey, vars?: Record<string, string | number>) => t(key, vars, lang);
}

/** A message key plus its values, for errors thrown below the route and translated there. */
export type Message = { key: MessageKey; vars?: Record<string, string | number> };
