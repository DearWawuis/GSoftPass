// extension/contentScript.js
(function () {
  if (window.__gsoftpassContentLoaded) return;
  window.__gsoftpassContentLoaded = true;

  const BRAND_ALIASES = {
    twitch: ['twitch', 'twitch.tv', 'jtvnw', 'ttvnw', 'passport.twitch'],
    google: ['google', 'gmail', 'youtube', 'accounts.google', 'youtu.be'],
    microsoft: ['microsoft', 'live.com', 'outlook', 'hotmail', 'office', 'xbox', 'msn'],
    meta: ['facebook', 'fb.com', 'messenger', 'instagram', 'threads', 'meta.com'],
    twitter: ['twitter', 'x.com', 'twimg'],
    amazon: ['amazon', 'aws', 'primevideo', 'audible', 'amzn'],
    apple: ['apple', 'icloud', 'itunes'],
    discord: ['discord', 'discordapp'],
    netflix: ['netflix'],
    spotify: ['spotify'],
    github: ['github', 'githubusercontent'],
    steam: ['steam', 'steampowered', 'steamcommunity'],
    epicgames: ['epicgames', 'unrealengine', 'fortnite'],
    playstation: ['playstation', 'sonyentertainmentnetwork'],
    nintendo: ['nintendo'],
    paypal: ['paypal'],
    mercadolibre: ['mercadolibre', 'mercadopago', 'meli'],
    bbva: ['bbva', 'bancomer'],
    santander: ['santander'],
    nubank: ['nubank', 'nu.com'],
  };

  let activeDropdown = null;
  let activeTargetInput = null;
  const trackedInputs = new Map(); // input -> badge element

  function normalizeText(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9.\s]/g, ' ')
      .trim();
  }

  function extractRootBrand(str) {
    const clean = normalizeText(str)
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '');
    const hostPart = clean.split('/')[0];
    const segments = hostPart
      .split(/[\s.-]+/)
      .filter((s) => s.length > 2 && !['com', 'net', 'org', 'app', 'www', 'login', 'auth', 'sso', 'accounts', 'passport', 'secure', 'web', 'mobile'].includes(s));
    return segments;
  }

  function levenshtein(a, b) {
    if (!a || !b) return 99;
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  function detectBrandFamily(tokens) {
    const joined = tokens.join(' ');
    for (const [family, aliases] of Object.entries(BRAND_ALIASES)) {
      if (aliases.some((alias) => joined.includes(alias))) {
        return family;
      }
    }
    return null;
  }

  /**
   * Motor de emparejamiento inteligente (IA heurística local):
   * Reconoce equivalencias de marca aunque la URL no sea idéntica
   * (ej. passport.twitch.tv, m.twitch.tv, o cuenta guardada solo como "Twitch").
   */
  function scoreAccountMatch(account) {
    const hostname = window.location.hostname.toLowerCase();
    const ogSite = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '';
    const pageTitle = document.title || '';

    const pageTokens = [
      ...extractRootBrand(hostname),
      ...extractRootBrand(ogSite),
      ...extractRootBrand(pageTitle),
    ];
    const pageFamily = detectBrandFamily([hostname, normalizeText(ogSite), normalizeText(pageTitle)]);

    const accName = normalizeText(account.name || '');
    const accUrl = normalizeText(account.url || '');
    const accTokens = [...extractRootBrand(accName), ...extractRootBrand(accUrl)];
    const accFamily = detectBrandFamily([accName, accUrl]);

    let score = 0;

    // 1. Coincidencia exacta de dominio
    if (accUrl && (accUrl.includes(hostname.replace(/^www\./, '')) || hostname.includes(accUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]))) {
      score += 120;
    }

    // 2. Coincidencia por familia de marca / ecosistema (ej. Twitch, Google, Microsoft, X/Twitter)
    if (pageFamily && accFamily && pageFamily === accFamily) {
      score += 100;
    }

    // 3. Coincidencia por tokens principales (nombre de la cuenta vs dominio/título)
    for (const pTok of pageTokens) {
      for (const aTok of accTokens) {
        if (pTok === aTok) {
          score += 65;
        } else if (pTok.length >= 4 && aTok.length >= 4) {
          if (pTok.includes(aTok) || aTok.includes(pTok)) {
            score += 45;
          } else if (levenshtein(pTok, aTok) <= 1) {
            score += 35; // Tolera pequeños errores de escritura (ej. "Twich" -> "Twitch")
          }
        }
      }
    }

    return score;
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 40 && rect.height > 18;
  }

  function classifyInput(input) {
    if (!input || input.tagName !== 'INPUT' || input.disabled || input.readOnly) return null;
    const type = (input.type || 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'search', 'date', 'number', 'range'].includes(type)) {
      return null;
    }
    if (type === 'password') return 'password';

    const attrs = [
      input.name,
      input.id,
      input.placeholder,
      input.getAttribute('autocomplete'),
      input.getAttribute('aria-label'),
      input.getAttribute('data-a-target'),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (
      type === 'email' ||
      /user|login|email|correo|mail|account|identifier|nick|usuario|phone|tel/.test(attrs)
    ) {
      return 'username';
    }

    // Si hay un input de contraseña cercano en el mismo formulario, asumimos que este campo de texto es el usuario
    const form = input.closest('form') || document.body;
    const hasPasswordNearby = Boolean(form.querySelector('input[type="password"]'));
    if (hasPasswordNearby && type === 'text') {
      return 'username';
    }

    return null;
  }

  /**
   * Rellena el valor de forma compatible con React, Vue y Angular (ej. Twitch)
   */
  function setNativeInputValue(input, value) {
    if (!input || value === undefined || value === null) return;
    const proto = window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillCredentials(targetInput, account) {
    const scope = targetInput.closest('form') || document.body;
    const allInputs = Array.from(scope.querySelectorAll('input')).filter(isVisible);

    const passwordInput =
      classifyInput(targetInput) === 'password'
        ? targetInput
        : allInputs.find((i) => classifyInput(i) === 'password');

    const usernameInput =
      classifyInput(targetInput) === 'username'
        ? targetInput
        : allInputs.find((i) => classifyInput(i) === 'username' && i !== passwordInput);

    if (usernameInput && account.username) {
      setNativeInputValue(usernameInput, account.username);
    }
    if (passwordInput && account.password) {
      setNativeInputValue(passwordInput, account.password);
    }
    closeDropdown();
  }

  function closeDropdown() {
    if (activeDropdown) {
      activeDropdown.remove();
      activeDropdown = null;
      activeTargetInput = null;
    }
  }

  function renderDropdown(targetInput, showAll = false) {
    closeDropdown();
    activeTargetInput = targetInput;

    chrome.storage.local.get(['gsoftpass_autofill_cache'], (res) => {
      const accounts = Array.isArray(res?.gsoftpass_autofill_cache)
        ? res.gsoftpass_autofill_cache
        : [];

      const scored = accounts
        .map((acc) => ({ acc, score: scoreAccountMatch(acc) }))
        .sort((a, b) => b.score - a.score);

      const matched = scored.filter((s) => s.score >= 35);
      const listToShow = showAll || matched.length === 0 ? scored : matched;

      const rect = targetInput.getBoundingClientRect();
      const dropdown = document.createElement('div');
      dropdown.id = 'gsoftpass-autofill-dropdown';
      dropdown.style.cssText = `
        position: fixed;
        top: ${Math.min(rect.bottom + 4, window.innerHeight - 260)}px;
        left: ${Math.max(8, Math.min(rect.left, window.innerWidth - 310))}px;
        width: ${Math.max(rect.width, 290)}px;
        max-width: 340px;
        max-height: 290px;
        overflow-y: auto;
        background: #0F172A;
        color: #F8FAFC;
        border: 1px solid #06B6D4;
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        padding: 6px;
        box-sizing: border-box;
      `;

      const header = document.createElement('div');
      header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 8px;
        border-bottom: 1px solid #1E293B;
        margin-bottom: 4px;
        font-size: 11px;
        font-weight: 700;
        color: #06B6D4;
      `;
      const logoUrl = chrome.runtime.getURL('icon-32.png');
      header.innerHTML = `
        <span style="display:flex;align-items:center;gap:6px;">
          <img src="${logoUrl}" style="width:16px;height:16px;border-radius:4px;" />
          GSoftPass ${matched.length > 0 && !showAll ? '· Sugerencias IA' : '· Bóveda'}
        </span>
      `;

      const closeBtn = document.createElement('span');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'cursor:pointer;color:#94A3B8;font-size: