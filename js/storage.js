// Thin wrapper over localStorage. Every access is guarded because storage can
// be unavailable (private tabs, full storage, some in-app browsers).
const Store = (() => {
  const PREFIX = 'farmvisits.';

  function load(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      // nothing to do
    }
  }

  return { load, save, remove };
})();
