/**
 * Gestionnaire de proxies résidentiels rotatifs
 * 
 * ⚠️ POUR 500 COMPTES : Il FAUT un pool de proxies. 1 IP = max 3 comptes Gmail.
 * Sans ça, Google bannit tous les comptes en bloc.
 * 
 * Solutions :
 * - Bright Data : ~500€/mois pour 500 IPs résidentielles
 * - Oxylabs : ~400€/mois
 * - Proxy-cheap mobile : ~200€/mois (IPs 4G rotation)
 * - Alternative gratuite (LIMITÉE) : Proton VPN rotation manuelle
 */

const PROXY_POOL = [
  // TODO: Remplir avec tes vrais proxies Bright Data / Oxylabs
  // Format: http://user:pass@host:port
  // Exemple: { url: 'http://brd-customer-xxx:password@brd.superproxy.io:22225', region: 'france', city: 'orleans' }
];

// Mode fallback : pas de proxy (UNIQUEMENT pour test local 1 compte)
const USE_PROXY = process.env.USE_PROXY === 'true' || PROXY_POOL.length > 0;

/**
 * Récupère un proxy pour un compte donné
 * Déterministe : même userId = même proxy (stabilité)
 */
function getProxyForAccount(userId) {
  if (!USE_PROXY || PROXY_POOL.length === 0) {
    console.log('[PROXY] Mode sans proxy (TEST LOCAL UNIQUEMENT)');
    return null;
  }

  // Hash deterministe pour toujours assigner le même proxy au même user
  const hash = hashString(userId);
  const index = hash % PROXY_POOL.length;
  const proxy = PROXY_POOL[index];

  console.log(`[PROXY] Proxy assigné pour ${userId}: ${proxy.region}/${proxy.city || 'unknown'}`);
  return proxy;
}

/**
 * Récupère un proxy aléatoire (pour rotation)
 */
function getRandomProxy() {
  if (!USE_PROXY || PROXY_POOL.length === 0) {
    return null;
  }
  const proxy = PROXY_POOL[Math.floor(Math.random() * PROXY_POOL.length)];
  return proxy;
}

/**
 * Formate le proxy pour Puppeteer
 */
function formatPuppeteerProxy(proxy) {
  if (!proxy) return null;
  return {
    server: proxy.url,
    bypassList: ['localhost']
  };
}

/**
 * Hash simple déterministe
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Configure un nouveau proxy dans le pool
 */
function addProxy(url, region = 'france', city = 'orleans') {
  PROXY_POOL.push({ url, region, city });
  console.log(`[PROXY] Ajouté: ${region}/${city}`);
}

/**
 * Vérifie si le pool est suffisant pour N comptes
 * Règle: 1 IP = 3 comptes max
 */
function checkPoolCapacity(targetAccounts = 500) {
  const maxAccounts = PROXY_POOL.length * 3;
  const needed = Math.ceil(targetAccounts / 3);
  
  console.log(`[PROXY] Capacité: ${PROXY_POOL.length} IPs → ${maxAccounts} comptes max`);
  console.log(`[PROXY] Objectif: ${targetAccounts} comptes → ${needed} IPs nécessaires`);
  
  if (PROXY_POOL.length === 0) {
    console.warn('[PROXY] ⚠️ AUCUN PROXY CONFIGURÉ - Google va bloquer immédiatement');
    return false;
  }
  
  if (maxAccounts < targetAccounts) {
    console.warn(`[PROXY] ⚠️ MANQUE ${needed - PROXY_POOL.length} PROXIES pour ${targetAccounts} comptes`);
    return false;
  }
  
  console.log('[PROXY] ✅ Capacité suffisante');
  return true;
}

module.exports = {
  getProxyForAccount,
  getRandomProxy,
  formatPuppeteerProxy,
  addProxy,
  checkPoolCapacity,
  PROXY_POOL,
  USE_PROXY
};