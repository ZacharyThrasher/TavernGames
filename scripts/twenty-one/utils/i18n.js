function formatTemplate(text, data = {}) {
  if (!text || !data || typeof data !== "object") return text;
  let output = text;
  for (const [key, value] of Object.entries(data)) {
    output = output.replaceAll(`{${key}}`, String(value));
  }
  return output;
}

export function localizeOrFallback(key, fallback, data = {}) {
  const localized = game.i18n?.localize?.(key);
  const text = localized && localized !== key ? localized : (fallback ?? key);
  return formatTemplate(text, data);
}
