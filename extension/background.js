// extension/background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GSOFTPASS_GET_ACCOUNTS_FOR_DOMAIN') {
    chrome.storage.local.get(['gsoftpass_autofill_cache'], (result) => {
      const allAccounts = result.gsoftpass_autofill_cache || [];
      const domain = message.domain.toLowerCase();
      const matches = allAccounts.filter(
        (acc) =>
          (acc.url && acc.url.toLowerCase().includes(domain)) ||
          (acc.name && domain.includes(acc.name.toLowerCase()))
      );
      sendResponse({ accounts: matches });
    });
    return true;
  }

  if (message.type === 'GSOFTPASS_SAVE_NEW_ACCOUNT') {
    chrome.storage.local.get(['gsoftpass_autofill_cache'], (result) => {
      const current = result.gsoftpass_autofill_cache || [];
      const updated = [message.payload, ...current];
      chrome.storage.local.set({ gsoftpass_autofill_cache: updated }, () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }
});