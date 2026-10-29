// Set by tools/bump_version.py on every publish (matches VERSION in sw.js). Don't edit by hand.
export const APP_VERSION = 'v20261029-1322';

// 'v20261029-0641' -> 'Oct 29, 2026'
export function versionDate(version = APP_VERSION) {
  const m = /^v(\d{4})(\d{2})(\d{2})/.exec(version);
  if (!m) return '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
