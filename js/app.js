// App shell: simple hash routing between the three screens.
(() => {
  const SCREENS = ['profile', 'feedback', 'package'];
  const DEFAULT = 'profile';

  const title = document.getElementById('screen-title');
  const tabs = document.querySelectorAll('.tabbar a');

  function show() {
    const requested = location.hash.slice(1);
    const current = SCREENS.includes(requested) ? requested : DEFAULT;

    for (const name of SCREENS) {
      const el = document.getElementById(`screen-${name}`);
      el.hidden = name !== current;
      if (name === current) {
        title.textContent = el.dataset.title;
        document.title = `${el.dataset.title} · Farm Visits`;
      }
    }
    for (const tab of tabs) {
      if (tab.dataset.screen === current) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
    window.scrollTo(0, 0);
    // Re-read feedback and farm answers each time, since either may have changed.
    if (current === 'package') Analysis.onShow();
  }

  Profile.init();
  Feedback.init();
  Analysis.init();
  window.addEventListener('hashchange', show);
  show();

  // Keeps the app and the AI library available offline. Needs a secure
  // context (https, or http://localhost).
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
