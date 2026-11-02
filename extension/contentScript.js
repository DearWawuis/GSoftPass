// extension/contentScript.js
(function () {
  const currentDomain = window.location.hostname.replace(/^www\./, '');

  // 1. Detectar campos de contraseña en cualquier página web
  function scanForms() {
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    passwordInputs.forEach((pwdInput) => {
      if (pwdInput.dataset.gsoftpassBound) return;
      pwdInput.dataset.gsoftpassBound = 'true';

      const form = pwdInput.closest('form') || document.body;
      const userInput =
        form.querySelector(
          'input[type="email"], input[name*="user" i], input[name*="email" i], input[name*="login" i], input[type="text"]'
        ) || null;

      // Mostrar sugerencia de Autocompletado al tocar el input
      pwdInput.addEventListener('focus', () => {
        showAutofillSuggestion(userInput, pwdInput);
      });
      if (userInput) {
        userInput.addEventListener('focus', () => {
          showAutofillSuggestion(userInput, pwdInput);
        });
      }

      // Detectar envío de formulario para preguntar "¿Deseas guardar esta Cuenta en GSoftPass?"
      form.addEventListener('submit', () => {
        const usernameVal = userInput ? userInput.value.trim() : '';
        const passwordVal = pwdInput.value;
        if (passwordVal && passwordVal.length >= 4) {
          showSaveAccountPopup(currentDomain, usernameVal, passwordVal);
        }
      });
    });
  }

  // 2. Pop-up de sugerencia de Autocompletado (Estilo Samsung Pass)
  function showAutofillSuggestion(userInput, pwdInput) {
    if (document.getElementById('gsoftpass-autofill-pill')) return;

    chrome.runtime.sendMessage(
      { type: 'GSOFTPASS_GET_ACCOUNTS_FOR_DOMAIN', domain: currentDomain },
      (response) => {
        const accounts = (response && response.accounts) || [];
        if (accounts.length === 0) return;

        const targetInput = userInput || pwdInput;
        const rect = targetInput.getBoundingClientRect();

        const pill = document.createElement('div');
        pill.id = 'gsoftpass-autofill-pill';
        pill.style.cssText = `
          position: fixed;
          top: ${rect.bottom + 6}px;
          left: ${rect.left}px;
          z-index: 2147483647;
          background: #0B0F19;
          border: 1px solid #06B6D4;
          border-radius: 12px;
          padding: 10px 14px;
          color: #FFFFFF;
          font-family: system-ui, sans-serif;
          box-shadow: 0 10px 25px rgba(0,0,0,0.6);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
        `;

        const acc = accounts[0];
        pill.innerHTML = `
          <div style="width:28px;height:28px;border-radius:8px;background:#06B6D4;color:#0B0F19;font-weight:800;display:flex;align-items:center;justify-content:center;">G</div>
          <div>
            <div style="font-size:12px;font-weight:700;color:#06B6D4;">Autocompletar con GSoftPass</div>
            <div style="font-size:13px;font-weight:600;color:#FFF;">${acc.username}</div>
          </div>
        `;

        pill.addEventListener('click', () => {
          if (userInput) {
            userInput.value = acc.username;
            userInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          pwdInput.value = acc.password;
          pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
          pill.remove();
        });

        document.body.appendChild(pill);
        setTimeout(() => pill.remove(), 7000);
      }
    );
  }

  // 3. Pop-up para avisar al usuario si desea guardar la "Cuenta" creada
  function showSaveAccountPopup(domain, username, password) {
    if (document.getElementById('gsoftpass-save-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'gsoftpass-save-modal';
    modal.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 340px;
      z-index: 2147483647;
      background: #151C2C;
      border: 1px solid #06B6D4;
      border-radius: 16px;
      padding: 18px;
      color: #FFFFFF;
      font-family: system-ui, sans-serif;
      box-shadow: 0 16px 40px rgba(0,0,0,0.75);
    `;

    const appName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="color:#06B6D4;font-weight:800;font-size:15px;">🛡️ GSoftPass</span>
        <button id="gsoft-close" style="background:none;border:none;color:#94A3B8;cursor:pointer;font-size:16px;">✕</button>
      </div>
      <div style="font-size:14px;font-weight:700;margin-bottom:4px;">¿Guardar esta Cuenta en tu bóveda?</div>
      <div style="font-size:12px;color:#94A3B8;margin-bottom:12px;">Se detectó un nuevo inicio de sesión en <b>${appName}</b> (${domain})</div>
      <div style="background:#0B0F19;padding:10px;border-radius:10px;margin-bottom:14px;font-size:12px;">
        <div style="color:#94A3B8;">Usuario / Correo: <b style="color:#FFF;">${username || 'Sin usuario'}</b></div>
        <div style="color:#94A3B8;margin-top:4px;">Contraseña: <b style="color:#06B6D4;">••••••••••</b></div>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="gsoft-cancel" style="flex:1;padding:10px;border-radius:10px;background:#1E293B;border:1px solid #26334D;color:#94A3B8;font-weight:600;cursor:pointer;">Ahora no</button>
        <button id="gsoft-save" style="flex:1;padding:10px;border-radius:10px;background:#06B6D4;border:none;color:#0B0F19;font-weight:800;cursor:pointer;">Guardar Cuenta</button>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('gsoft-close').onclick = () => modal.remove();
    document.getElementById('gsoft-cancel').onclick = () => modal.remove();
    document.getElementById('gsoft-save').onclick = () => {
      chrome.runtime.sendMessage(
        {
          type: 'GSOFTPASS_SAVE_NEW_ACCOUNT',
          payload: {
            id: 'ext_' + Date.now(),
            name: appName,
            url: window.location.origin,
            username: username,
            password: password,
          },
        },
        () => {
          modal.innerHTML = `<div style="text-align:center;padding:12px;color:#10B981;font-weight:700;">✓ ¡Cuenta guardada en GSoftPass!</div>`;
          setTimeout(() => modal.remove(), 1800);
        }
      );
    };
  }

  scanForms();
  const observer = new MutationObserver(scanForms);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();