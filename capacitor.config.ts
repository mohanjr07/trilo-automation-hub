import type { CapacitorConfig } from '@capacitor/cli';

// The app loads the LIVE website, so every git push (Cloudflare deploy) updates
// the phone app too — no new APK needed unless native bits change.
// Supabase traffic goes through the site's /sb relay (office Wi-Fi / Jio / Airtel fix).
const config: CapacitorConfig = {
  appId: 'com.triloautomation.maplsalestracker',
  appName: 'MAPL Task Flow',
  webDir: 'dist',
  server: {
    url: 'https://mapltaskflow.pages.dev',
    errorPath: 'offline.html',
  },
  android: { allowMixedContent: false },
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
