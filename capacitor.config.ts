import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cz.petriczech.tapnote',
  appName: 'Tapnote',
  webDir: 'dist/tapnote/browser',
  plugins: {
    // Splash jen do prvního vykreslení
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 0,
    },
  },
};

export default config;
