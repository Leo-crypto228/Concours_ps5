/**
 * Gestionnaire de sessions/cookies Google
 * 
 * Le but : stocker les cookies SAPISID, SID, SSID, APISID, __Secure-1PSID, etc.
 * Pour pouvoir reconnecter le bot dans 1 an comme si c'était "l'ordinateur de confiance".
 * 
 * Stockage : Supabase (chiffré avec MASTER_KEY) ou fichier local chiffré
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSION_DIR = path.join(__dirname, '..', '.sessions');
const MASTER_KEY = process.env.MASTER_KEY || 'change-moi-avec-32-octets-hex';

// Crée le dossier sessions si inexistant
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

/**
 * Chiffre les cookies avec AES-256-GCM
 */
function encryptCookies(cookies, userId) {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(MASTER_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(JSON.stringify(cookies), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted,
    userId: userId
  };
}

/**
 * Déchiffre les cookies
 */
function decryptCookies(encryptedData) {
  try {
    const key = crypto.scryptSync(MASTER_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm', 
      key, 
      Buffer.from(encryptedData.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('[SESSION] Erreur déchiffrement:', error);
    return null;
  }
}

/**
 * Sauvegarde les cookies d'une session
 */
async function saveSession(userId, cookies, fingerprint = {}) {
  const sessionData = {
    cookies: cookies,
    fingerprint: {
      userAgent: fingerprint.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: fingerprint.viewport || { width: 1920, height: 1080 },
      platform: fingerprint.platform || 'Win32',
      language: fingerprint.language || 'fr-FR',
      timezone: fingerprint.timezone || 'Europe/Paris',
      ...fingerprint
    },
    savedAt: new Date().toISOString(),
    lastUsed: new Date().toISOString()
  };

  // Chiffre et sauvegarde localement
  const encrypted = encryptCookies(sessionData, userId);
  const filePath = path.join(SESSION_DIR, `${userId}.session`);
  fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2));

  console.log(`[SESSION] Session sauvegardée pour ${userId} (${cookies.length} cookies)`);
  return sessionData;
}

/**
 * Charge les cookies d'une session
 */
async function loadSession(userId) {
  const filePath = path.join(SESSION_DIR, `${userId}.session`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`[SESSION] Aucune session trouvée pour ${userId}`);
    return null;
  }

  try {
    const encrypted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const sessionData = decryptCookies(encrypted);
    
    if (!sessionData) {
      console.error(`[SESSION] Échec déchiffrement pour ${userId}`);
      return null;
    }

    console.log(`[SESSION] Session chargée pour ${userId} (${sessionData.cookies.length} cookies)`);
    return sessionData;
  } catch (error) {
    console.error(`[SESSION] Erreur chargement ${userId}:`, error);
    return null;
  }
}

/**
 * Applique les cookies à une page Puppeteer
 */
async function applySessionToPage(page, sessionData) {
  if (!sessionData || !sessionData.cookies) {
    return false;
  }

  try {
    // Définit le User-Agent
    await page.setUserAgent(sessionData.fingerprint.userAgent);
    
    // Définit la taille d'écran
    await page.setViewport(sessionData.fingerprint.viewport);
    
    // Applique les cookies
    for (const cookie of sessionData.cookies) {
      try {
        await page.setCookie({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          expires: cookie.expires,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite
        });
      } catch (e) {
        // Ignore les cookies invalides
      }
    }

    console.log(`[SESSION] Cookies appliqués (${sessionData.cookies.length} cookies)`);
    return true;
  } catch (error) {
    console.error('[SESSION] Erreur application cookies:', error);
    return false;
  }
}

/**
 * Extrait les cookies importants d'une page
 */
async function extractImportantCookies(page) {
  const allCookies = await page.cookies();
  
  // Cookies critiques pour Google
  const criticalNames = [
    'SAPISID', 'APISID', 'SSID', 'SID', 
    '__Secure-1PSID', '__Secure-3PSID',
    '__Secure-1PSIDTS', '__Secure-3PSIDTS',
    'ACCOUNT_CHOOSER', 'GAPS', 'LSID', 'OSID',
    '1P_JAR', 'NID', 'AEC', 'DV'
  ];
  
  const important = allCookies.filter(c => 
    criticalNames.includes(c.name) || 
    c.domain.includes('google.com') ||
    c.domain.includes('google.fr')
  );

  console.log(`[SESSION] ${important.length} cookies critiques extraits sur ${allCookies.length} total`);
  return important;
}

/**
 * Supprime une session
 */
function deleteSession(userId) {
  const filePath = path.join(SESSION_DIR, `${userId}.session`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`[SESSION] Session supprimée pour ${userId}`);
    return true;
  }
  return false;
}

module.exports = {
  saveSession,
  loadSession,
  applySessionToPage,
  extractImportantCookies,
  deleteSession,
  encryptCookies,
  decryptCookies
};