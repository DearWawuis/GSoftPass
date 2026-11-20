// extension/contentScript.js
(function () {
  if (window.__gsoftpassContentLoaded) return;
  window.__gsoftpassContentLoaded = true;

  const CACHE_KEY = 'gsoftpass_autofill_cache';
  const PENDING_SAVE_KEY = 'gsoftpass_pending_save_prompt';
  const PENDING_IMPORT_KEY = 'gsoftpass_pending_vault_imports';

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
  let activeSaveBanner = null;
  const trackedInputs = new Map();

  // Borrador en memoria de lo que el usuario está escribiendo en la página actual
  let draftCredentials = {
    username: '',
    password: '',
    hostname: window.location.hostname.toLowerCase(),
  };

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
    return hostPart
      .split(/[\s.-]+/)
      .filter(
        (s) =>
          s.length > 2 &&
          ![
            'com', 'net', 'org', 'app', 'www', 'login', 'auth', 'sso',
            'accounts', 'passport', 'secure', 'web', 'mobile',
          ].includes(s)
      );
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
      if (aliases.some((alias) => joined.includes(alias))) return family;
    }
    return null;
  }

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

    if (
      accUrl &&
      (accUrl.includes(hostname.replace(/^www\./, '')) ||
        hostname.includes(accUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]))
    ) {
      score += 120;
    }

    if (pageFamily && accFamily && pageFamily === accFamily) {
      score += 100;
    }

    for (const pTok of pageTokens) {
      for (const aTok of accTokens) {
        if (pTok === aTok) {
          score += 65;
        } else if (pTok.length >= 4 && aTok.length >= 4) {
          if (pTok.includes(aTok) || aTok.includes(pTok)) {
            score += 45;
          } else if (levenshtein(pTok, aTok) <= 1) {
            score += 35;
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

    const form = input.closest('form') || document.body;
    const hasPasswordNearby = Boolean(form.querySelector('input[type="password"]'));
    if (hasPasswordNearby && type === 'text') {
      return 'username';
    }

    return null;
  }

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

    chrome.storage.local.get([CACHE_KEY], (res) => {
      const accounts = Array.isArray(res?.[CACHE_KEY]) ? res[CACHE_KEY] : [];

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
      closeBtn.style.cssText = 'cursor:pointer;color:#94A3B8;font-size:12px;padding:2px 4px;';
      closeBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        closeDropdown();
      });
      header.appendChild(closeBtn);
      dropdown.appendChild(header);

      if (listToShow.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:12px 8px;font-size:12px;color:#94A3B8;text-align:center;';
        empty.textContent = 'Abre la extensión GSoftPass e inicia sesión para sincronizar tus cuentas.';
        dropdown.appendChild(empty);
      } else {
        listToShow.slice(0, 8).forEach(({ acc }) => {
          const row = document.createElement('div');
          row.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px;
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.15s;
          `;
          row.addEventListener('mouseenter', () => (row.style.background = '#1E293B'));
          row.addEventListener('mouseleave', () => (row.style.background = 'transparent'));
          row.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fillCredentials(targetInput, acc);
          });

          const iconWrap = document.createElement('div');
          iconWrap.style.cssText = `
            width: 28px;
            height: 28px;
            border-radius: 8px;
            background: ${acc.brandColor || '#6366F1'};
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            overflow: hidden;
            font-weight: 800;
            font-size: 13px;
            color: #FFF;
          `;
          if (acc.iconUrl) {
            const img = document.createElement('img');
            img.src = acc.iconUrl;
            img.style.cssText = 'width:18px;height:18px;object-fit:contain;';
            img.onerror = () => {
              iconWrap.textContent = (acc.name || 'G').charAt(0).toUpperCase();
            };
            iconWrap.appendChild(img);
          } else {
            iconWrap.textContent = (acc.name || 'G').charAt(0).toUpperCase();
          }

          const textCol = document.createElement('div');
          textCol.style.cssText = 'overflow:hidden;flex:1;';
          const userLine = document.createElement('div');
          userLine.textContent = acc.username || acc.name;
          userLine.style.cssText = 'font-size:13px;font-weight:700;color:#F8FAFC;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          const nameLine = document.createElement('div');
          nameLine.textContent = acc.name || acc.url || 'Cuenta guardada';
          nameLine.style.cssText = 'font-size:11px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          textCol.appendChild(userLine);
          textCol.appendChild(nameLine);

          row.appendChild(iconWrap);
          row.appendChild(textCol);
          dropdown.appendChild(row);
        });

        if (matched.length > 0 && !showAll && accounts.length > matched.length) {
          const toggleAll = document.createElement('div');
          toggleAll.textContent = `Ver todas las cuentas (${accounts.length})`;
          toggleAll.style.cssText = `
            text-align: center;
            padding: 7px;
            margin-top: 4px;
            border-top: 1px solid #1E293B;
            font-size: 11px;
            font-weight: 700;
            color: #06B6D4;
            cursor: pointer;
          `;
          toggleAll.addEventListener('mousedown', (e) => {
            e.preventDefault();
            renderDropdown(targetInput, true);
          });
          dropdown.appendChild(toggleAll);
        }
      }

      document.documentElement.appendChild(dropdown);
      activeDropdown = dropdown;
    });
  }

  // =========================================================================
  // VENTANA FLOTANTE PERSISTENTE PARA GUARDAR CONTRASEÑA (Sobrevive a redirecciones)
  // =========================================================================

  function removeSaveBanner() {
    if (activeSaveBanner) {
      activeSaveBanner.remove();
      activeSaveBanner = null;
    }
  }

  function dismissPendingSave() {
    chrome.storage.local.remove([PENDING_SAVE_KEY], () => {
      removeSaveBanner();
    });
  }

  function confirmSavePending(pending, customName, customUsername) {
    const cleanName = (customName || pending.name || pending.hostname || 'Cuenta').trim();
    const cleanUser = (customUsername || pending.username || '').trim();
    const newEntry = {
      id: `ext_save_${Date.now()}`,
      name: cleanName,
      url: pending.url || `https://${pending.hostname}`,
      username: cleanUser,
      password: pending.password,
      iconUrl: `https://www.google.com/s2/favicons?domain=${pending.hostname}&sz=128`,
      brandColor: '#06B6D4',
      timestamp: Date.now(),
    };

    chrome.storage.local.get([CACHE_KEY, PENDING_IMPORT_KEY], (res) => {
      const cache = Array.isArray(res?.[CACHE_KEY]) ? res[CACHE_KEY] : [];
      const imports = Array.isArray(res?.[PENDING_IMPORT_KEY]) ? res[PENDING_IMPORT_KEY] : [];

      const updatedCache = [newEntry, ...cache];
      const updatedImports = [newEntry, ...imports];

      chrome.storage.local.set(
        {
          [CACHE_KEY]: updatedCache,
          [PENDING_IMPORT_KEY]: updatedImports,
        },
        () => {
          chrome.storage.local.remove([PENDING_SAVE_KEY], () => {
            removeSaveBanner();
          });
        }
      );
    });
  }

  function showPersistentSaveBanner(pending) {
    if (!pending || !pending.password) return;
    removeSaveBanner();

    const banner = document.createElement('div');
    banner.id = 'gsoftpass-persistent-save-banner';
    banner.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 330px;
      background: #0F172A;
      color: #F8FAFC;
      border: 1.5px solid #06B6D4;
      border-radius: 16px;
      box-shadow: 0 18px 42px rgba(0, 0, 0, 0.65);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 16px;
      box-sizing: border-box;
    `;

    const logoUrl = chrome.runtime.getURL('icon-32.png');

    banner.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <img src="${logoUrl}" style="width:20px;height:20px;border-radius:5px;" />
          <span style="font-size:14px;font-weight:800;color:#F8FAFC;">¿Guardar en GSoftPass?</span>
        </div>
        <button id="gsp-close-x" type="button" style="background:none;border:none;color:#94A3B8;font-size:15px;cursor:pointer;padding:2px 6px;">✕</button>
      </div>
      <div style="font-size:11px;color:#94A3B8;margin-bottom:10px;">
        Detectamos un inicio de sesión nuevo en <strong style="color:#06B6D4;">${pending.hostname}</strong>.
      </div>
      <div style="margin-bottom:8px;">
        <label style="display:block;font-size:11px;color:#94A3B8;margin-bottom:3px;">Nombre de la cuenta</label>
        <input id="gsp-save-name" type="text" value="" style="width:100%;box-sizing:border-box;background:#1E293B;color:#F8FAFC;border:1px solid #334155;border-radius:8px;padding:7px 10px;font-size:12px;outline:none;" />
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:11px;color:#94A3B8;margin-bottom:3px;">Usuario / Correo</label>
        <input id="gsp-save-user" type="text" value="" style="width:100%;box-sizing:border-box;background:#1E293B;color:#F8FAFC;border:1px solid #334155;border-radius:8px;padding:7px 10px;font-size:12px;outline:none;" />
      </div>
      <div style="display:flex;gap:8px;">
        <button id="gsp-btn-dismiss" type="button" style="flex:1;padding:9px;border-radius:10px;border:1px solid #334155;background:#1E293B;color:#CBD5E1;font-size:12px;font-weight:700;cursor:pointer;">
          Ahora no
        </button>
        <button id="gsp-btn-save" type="button" style="flex:1.2;padding:9px;border-radius:10px;border:none;background:#06B6D4;color:#0B0F19;font-size:12px;font-weight:800;cursor:pointer;">
          Guardar cuenta
        </button>
      </div>
    `;

    document.documentElement.appendChild(banner);
    activeSaveBanner = banner;

    const nameInput = banner.querySelector('#gsp-save-name');
    const userInput = banner.querySelector('#gsp-save-user');
    if (nameInput) nameInput.value = pending.name || pending.hostname;
    if (userInput) userInput.value = pending.username || '';

    banner.querySelector('#gsp-close-x')?.addEventListener('click', dismissPendingSave);
    banner.querySelector('#gsp-btn-dismiss')?.addEventListener('click', dismissPendingSave);
    banner.querySelector('#gsp-btn-save')?.addEventListener('click', () => {
      confirmSavePending(pending, nameInput?.value, userInput?.value);
    });
  }

  function queuePendingSaveIfNew() {
    const pwd = (draftCredentials.password || '').trim();
    const user = (draftCredentials.username || '').trim();
    if (!pwd) return;

    const hostname = window.location.hostname.toLowerCase().replace(/^www\./, '');
    const niceName =
      extractRootBrand(hostname)[0]?.replace(/^./, (c) => c.toUpperCase()) || hostname;

    chrome.storage.local.get([CACHE_KEY], (res) => {
      const accounts = Array.isArray(res?.[CACHE_KEY]) ? res[CACHE_KEY] : [];
      const alreadyExists = accounts.some((acc) => {
        const samePass = acc.password === pwd;
        const sameUser = !user || (acc.username || '').toLowerCase() === user.toLowerCase();
        const sameSite = scoreAccountMatch(acc) >= 35;
        return samePass && sameUser && sameSite;
      });

      if (alreadyExists) return;

      const pendingPayload = {
        name: niceName,
        url: window.location.origin,
        hostname,
        username: user,
        password: pwd,
        createdAt: Date.now(),
      };

      // Guardamos en chrome.storage.local para que persista aunque la página redirija de inmediato
      chrome.storage.local.set({ [PENDING_SAVE_KEY]: pendingPayload }, () => {
        showPersistentSaveBanner(pendingPayload);
      });
    });
  }

  function checkAndRestorePendingSaveBanner() {
    chrome.storage.local.get([PENDING_SAVE_KEY], (res) => {
      const pending = res?.[PENDING_SAVE_KEY];
      if (pending && pending.password) {
        showPersistentSaveBanner(pending);
      } else {
        removeSaveBanner();
      }
    });
  }

  // Captura en tiempo real mientras el usuario escribe en campos de login
  document.addEventListener(
    'input',
    (e) => {
      const input = e.target;
      const role = classifyInput(input);
      if (!role) return;
      if (role === 'password' && input.value) {
        draftCredentials.password = input.value;
        draftCredentials.hostname = window.location.hostname.toLowerCase();
      } else if (role === 'username' && input.value) {
        draftCredentials.username = input.value;
        draftCredentials.hostname = window.location.hostname.toLowerCase();
      }
    },
    true
  );

  // Disparadores al enviar el formulario o hacer clic en el botón de iniciar sesión
  document.addEventListener('submit', () => queuePendingSaveIfNew(), true);
  document.addEventListener(
    'click',
    (e) => {
      const btn = e.target?.closest?.('button, input[type="submit"]');
      if (btn && draftCredentials.password) {
        queuePendingSaveIfNew();
      }
    },
    true
  );
  window.addEventListener('beforeunload', () => {
    if (draftCredentials.password) {
      queuePendingSaveIfNew();
    }
  });

  // Si el usuario guarda o descarta en otra pestaña, sincroniza el cierre del aviso
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[PENDING_SAVE_KEY]) {
      const nextVal = changes[PENDING_SAVE_KEY].newValue;
      if (nextVal && nextVal.password) {
        showPersistentSaveBanner(nextVal);
      } else {
        removeSaveBanner();
      }
    }
  });

  function positionBadge(input, badge) {
    if (!isVisible(input)) {
      badge.style.display = 'none';
      return;
    }
    const rect = input.getBoundingClientRect();
    badge.style.display = 'flex';
    badge.style.top = `${rect.top + (rect.height - 22) / 2}px`;
    badge.style.left = `${rect.right - 30}px`;
  }

  function attachBadgeToInput(input) {
    if (trackedInputs.has(input)) {
      positionBadge(input, trackedInputs.get(input));
      return;
    }

    const badge = document.createElement('button');
    badge.type = 'button';
    badge.title = 'Autocompletar con GSoftPass';
    badge.style.cssText = `
      position: fixed;
      width: 22px;
      height: 22px;
      padding: 0;
      margin: 0;
      border: 1px solid rgba(6, 182, 212, 0.7);
      border-radius: 6px;
      background: #0F172A;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483646;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
    `;

    const img = document.createElement('img');
    img.src = chrome.runtime.getURL('icon-32.png');
    img.style.cssText = 'width:16px;height:16px;border-radius:3px;pointer-events:none;';
    badge.appendChild(img);

    badge.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeTargetInput === input && activeDropdown) {
        closeDropdown();
      } else {
        renderDropdown(input, false);
      }
    });

    input.addEventListener('focus', () => {
      renderDropdown(input, false);
    });

    document.documentElement.appendChild(badge);
    trackedInputs.set(input, badge);
    positionBadge(input, badge);
  }

  function scanAndAttach() {
    for (const [input, badge] of trackedInputs.entries()) {
      if (!input.isConnected) {
        badge.remove();
        trackedInputs.delete(input);
      } else {
        positionBadge(input, badge);
      }
    }

    const inputs = document.querySelectorAll('input');
    inputs.forEach((input) => {
      if (isVisible(input) && classifyInput(input)) {
        attachBadgeToInput(input);
      }
    });
  }

  const observer = new MutationObserver(() => scanAndAttach());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('scroll', scanAndAttach, true);
  window.addEventListener('resize', scanAndAttach);
  document.addEventListener('mousedown', (e) => {
    if (
      activeDropdown &&
      !activeDropdown.contains(e.target) &&
      e.target !== activeTargetInput
    ) {
      closeDropdown();
    }
  });

  // Restaurar inmediatamente el aviso persistente si venimos de una redirección tras iniciar sesión
  checkAndRestorePendingSaveBanner();
  setTimeout(scanAndAttach, 500);
  setInterval(scanAndAttach, 1500);
})();