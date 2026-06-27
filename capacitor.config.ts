import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.jajae.app",
  appName: "자재",
  webDir: "mobile/www",
  ...(serverUrl ? { server: { url: serverUrl, cleartext: true } } : {}),
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#1A56DB",
      showSpinner: false,
    },
  },
};

export default config;
