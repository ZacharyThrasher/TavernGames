import { localizeOrFallback } from "./i18n.js";

const t = (key, fallback, data = {}) => localizeOrFallback(key, fallback, data);

export function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return t("TAVERN.Time.JustNow", "just now");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("TAVERN.Time.MinutesAgo", "{minutes}m ago", { minutes });
  const hours = Math.floor(minutes / 60);
  return t("TAVERN.Time.HoursAgo", "{hours}h ago", { hours });
}
