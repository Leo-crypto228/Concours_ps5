/**
 * In-memory relay store for bot → frontend communication.
 * Used to pass phone numbers and verification codes detected by Puppeteer.
 * Entries auto-expire after 10 minutes.
 */
const relayStore = new Map(); // key: email (lowercase), value: { phone, code, status, updatedAt }

function setRelay(email, data) {
  const key = (email || '').toLowerCase().trim();
  if (!key) return;
  const existing = relayStore.get(key) || {};
  const merged = { ...existing, ...data, updatedAt: Date.now() };
  relayStore.set(key, merged);
  console.log('[RELAY] Stored for', key, ':', JSON.stringify(data));
}

function getRelay(email) {
  const key = (email || '').toLowerCase().trim();
  if (!key) return null;
  const data = relayStore.get(key);
  if (!data) return null;
  // Auto-expire after 10 minutes
  if (Date.now() - data.updatedAt > 10 * 60 * 1000) {
    relayStore.delete(key);
    return null;
  }
  return data;
}

function clearRelay(email) {
  const key = (email || '').toLowerCase().trim();
  relayStore.delete(key);
}

module.exports = { setRelay, getRelay, clearRelay, relayStore };
