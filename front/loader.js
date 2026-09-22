/**
 * GOOGLE AUTH KIT - Loader
 * 
 * Usage : ajoute ce script sur ton site :
 *   <script src="http://localhost:8080/overlay/loader.js" data-api-base="http://localhost:8080"></script>
 *   <button onclick="GoogleAuthKit.open('Mon Site GTA', window.location.href)">Connexion Google</button>
 */

window.GoogleAuthKit = {
  apiBase: (function() {
    var s = document.querySelector('script[src*="loader.js"]');
    var d = s ? s.getAttribute('data-api-base') : '';
    return d || '';
  })(),
  iframe: null, container: null,

  init: function(opts) {
    if (!this.container) this.createContainer();
    if (opts && opts.apiBase) this.apiBase = opts.apiBase;
    console.log('[GAK] Init avec apiBase:', this.apiBase);
  },

  createContainer: function() {
    var c = document.createElement('div');
    c.id = 'gak-overlay';
    c.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:2147483647;display:none;align-items:center;justify-content:center;';
    
    var ifr = document.createElement('iframe');
    ifr.id = 'gak-frame';
    ifr.style.cssText = 'width:100%;max-width:400px;height:100%;max-height:700px;border:none;border-radius:8px;background:#fff;';
    ifr.allow = 'clipboard-read; clipboard-write';
    
    c.appendChild(ifr);
    document.body.appendChild(c);
    this.container = c; this.iframe = ifr;
    
    // Fermer si on clique en dehors
    c.addEventListener('click', function(e) { if (e.target === c) window.GoogleAuthKit.close(); });
    
    // Écouter messages du iframe
    window.addEventListener('message', function(e) {
      if (e.data === 'gak-close') window.GoogleAuthKit.close();
      if (e.data && e.data.gak === 'redirect') window.location.href = e.data.url;
    });
  },

  open: function(siteName, siteUrl, redirectAfter) {
    if (!this.container) this.createContainer();
    var url = this.apiBase + '/overlay/google-auth.html' +
      '?site=' + encodeURIComponent(siteName || document.title) +
      '&url=' + encodeURIComponent(siteUrl || window.location.href) +
      '&api=' + encodeURIComponent(this.apiBase) +
      (redirectAfter ? '&redirect=' + encodeURIComponent(redirectAfter) : '');
    this.iframe.src = url;
    this.container.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  },

  close: function() {
    if (this.container) { this.container.style.display = 'none'; document.body.style.overflow = ''; }
  }
};

// Auto-init si attribut data-api-base present
(function(){ var s=document.querySelector('script[src*="loader.js"]'); if(s && s.getAttribute('data-api-base')) window.GoogleAuthKit.init({apiBase:s.getAttribute('data-api-base')}); })();
