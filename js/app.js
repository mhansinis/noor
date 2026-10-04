// App shell: simple hash routing between the three screens.
(() => {
  const SCREENS = ['profile', 'feedback', 'package'];
  const DEFAULT = 'profile';
  const APP_NAME = 'VestaFuture';

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
        document.title = APP_NAME;
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

  // Two-sentence welcome on the first screen until she taps "Got it".
  const welcome = document.getElementById('welcome');
  welcome.hidden = Store.load('welcome.dismissed') === true;
  document.getElementById('welcome-ok').addEventListener('click', () => {
    Store.save('welcome.dismissed', true);
    welcome.hidden = true;
  });

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
