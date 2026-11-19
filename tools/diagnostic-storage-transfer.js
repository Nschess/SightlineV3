(() => {
  if (location.origin !== 'https://appassets.androidplatform.net' || location.pathname !== '/assets/www/index.html') {
    throw new Error('Open the offline Sightline diagnostic page before transferring data.');
  }
  const schema = 'sightline-diagnostic-offline-v1';
  const keys = [
    'sightline.settings.v1', 'sightline.rules.v1', 'sightline.controls.v2', 'sightline.mobileHud.v1',
    'sightline-map', 'sightline-op', 'sightline-record', 'sightline.best.v1', 'sightline.weaponFinish',
    'sightline.weaponFinishes.v2', 'sightline.loadoutPreviewWeapon.v1', 'sightline.characterSkins.v1'
  ];
  window.sightlineSaveTransfer = Object.freeze({
    export() {
      const items = {};
      for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value !== null) items[key] = value;
      }
      return { schema, items };
    },
    restore(snapshot) {
      if (snapshot?.schema !== schema || !snapshot.items || typeof snapshot.items !== 'object' || Array.isArray(snapshot.items)) {
        throw new Error('Invalid Sightline offline backup.');
      }
      const entries = Object.entries(snapshot.items);
      if (entries.some(([key, value]) => !keys.includes(key) || typeof value !== 'string')) {
        throw new Error('The backup has unexpected keys or values.');
      }
      const prior = entries.map(([key]) => [key, localStorage.getItem(key)]);
      try {
        for (const [key, value] of entries) localStorage.setItem(key, value);
      } catch (error) {
        for (const [key, value] of prior) {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        }
        throw error;
      }
      return { restored: entries.length };
    }
  });
})();
