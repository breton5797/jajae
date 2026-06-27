import type { CapacitorConfig } from "@capacitor/cli";

// Production loads the hosted Next.js app; override with CAP_SERVER_URL
// (e.g. http://<LAN-IP>:3000) for local development.
const PROD_URL = "https://jajae.vercel.app";
const serverUrl = process.env.CAP_SERVER_URL ?? PROD_URL;
// Allow cleartext (non-TLS) traffic only for local http dev servers,
// never for the production https URL.
const isHttp = serverUrl.startsWith("http://");

const config: CapacitorConfig = {
  appId: "com.jajae.app",
  appName: "자재",
  webDir: "mobile/www",
  server: { url: serverUrl, cleartext: isHttp },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#1A56DB",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
