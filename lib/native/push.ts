import { Capacitor } from "@capacitor/core";
import {
  PushNotifications,
  type Token,
  type PushNotificationSchema,
  type ActionPerformed,
} from "@capacitor/push-notifications";

export type PushHandlers = {
  onToken?: (token: string) => void;
  onNotification?: (notification: PushNotificationSchema) => void;
  onAction?: (action: ActionPerformed) => void;
  onError?: (error: unknown) => void;
};

/**
 * Registers the device for push notifications.
 *
 * No-op on web — only runs inside the native Capacitor shell
 * (`Capacitor.isNativePlatform()`). Requires FCM (Android, google-services.json)
 * and APNs (iOS, Push capability + Apple Developer account) to be configured;
 * see docs/mobile/README.md. Wire this into a client component (e.g. after
 * login) and send the returned token to your backend once push is set up.
 */
export async function registerPush(handlers: PushHandlers = {}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === "prompt") {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== "granted") {
      handlers.onError?.(new Error("push permission not granted"));
      return;
    }

    await PushNotifications.removeAllListeners();
    await PushNotifications.addListener("registration", (token: Token) =>
      handlers.onToken?.(token.value),
    );
    await PushNotifications.addListener("registrationError", (error) =>
      handlers.onError?.(error),
    );
    await PushNotifications.addListener(
      "pushNotificationReceived",
      (notification: PushNotificationSchema) =>
        handlers.onNotification?.(notification),
    );
    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action: ActionPerformed) => handlers.onAction?.(action),
    );

    await PushNotifications.register();
  } catch (error) {
    handlers.onError?.(error);
  }
}
