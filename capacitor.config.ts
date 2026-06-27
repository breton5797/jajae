import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAP_SERVER_URL;
// Allow cleartext (non-TLS) traffic only for local http dev servers,
// never for production https URLs.
const isHttp = serverUrl?.startsWith("http://") ?? false;

const config: CapacitorConfig = {
  appId: "com.jajae.app",
  appName: "자재",
  webDir: "mobile/www",
  ...(serverUrl ? { server: { url: serverUrl, cleartext: isHttp } } : {}),
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#1A56DB",
      showSpinner: false,
    },
  },
};

export default config;
