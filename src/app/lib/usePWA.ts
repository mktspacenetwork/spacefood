import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const PWA_DISMISSED_KEY = "space-food-pwa-dismissed";
const PWA_INSTALLED_KEY = "space-food-pwa-installed";

/**
 * Convert a base64 VAPID public key to a Uint8Array for PushManager.subscribe
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Inject manifest link if not present
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/manifest.json";
      document.head.appendChild(link);
    }

    // Fetch settings to check for custom PWA icon, then apply icon
    applyPWAIcon();

    // Inject theme-color meta
    if (!document.querySelector('meta[name="theme-color"]')) {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = "#ff4500";
      document.head.appendChild(meta);
    }

    // iOS meta tags
    if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
      const capable = document.createElement("meta");
      capable.name = "apple-mobile-web-app-capable";
      capable.content = "yes";
      document.head.appendChild(capable);

      const statusBar = document.createElement("meta");
      statusBar.name = "apple-mobile-web-app-status-bar-style";
      statusBar.content = "black-translucent";
      document.head.appendChild(statusBar);

      const title = document.createElement("meta");
      title.name = "apple-mobile-web-app-title";
      title.content = "SpaceFood";
      document.head.appendChild(title);
    }

    // iOS Splash Screen (apple-touch-startup-image)
    injectIOSSplashScreens();

    // Register Service Worker
    if ("serviceWorker" in navigator) {
      try {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("SW registered:", reg.scope);
          })
          .catch((err) => {
            console.log("SW registration failed (non-blocking):", err);
          });
      } catch (err) {
        console.log("SW registration error (non-blocking):", err);
      }
    }

    // Detect iOS
    const ua = navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice);

    // Check if running in standalone mode (already installed)
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Check localStorage flags
    const wasDismissed = localStorage.getItem(PWA_DISMISSED_KEY);
    const wasInstalled = localStorage.getItem(PWA_INSTALLED_KEY);

    if (standalone || wasInstalled) {
      setIsInstalled(true);
      return;
    }

    // Listen for beforeinstallprompt (Chrome/Android)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Show banner after 5 seconds if not dismissed
      if (!wasDismissed) {
        timerRef.current = setTimeout(() => {
          setShowBanner(true);
        }, 5000);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // Listen for appinstalled
    const handleInstalled = () => {
      setIsInstalled(true);
      setShowBanner(false);
      setDeferredPrompt(null);
      localStorage.setItem(PWA_INSTALLED_KEY, "true");
    };

    window.addEventListener("appinstalled", handleInstalled);

    // For iOS, show the banner after 5s if not dismissed and not installed
    if (isIOSDevice && !standalone && !wasDismissed && !wasInstalled) {
      timerRef.current = setTimeout(() => {
        setShowBanner(true);
      }, 5000);
    }

    // Check current push permission
    if ("Notification" in window) {
      setPushPermission(Notification.permission);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const installApp = useCallback(async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }

    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === "accepted") {
        setIsInstalled(true);
        localStorage.setItem(PWA_INSTALLED_KEY, "true");
      }

      setDeferredPrompt(null);
      setShowBanner(false);
    } catch (err) {
      console.error("Install prompt error:", err);
    }
  }, [deferredPrompt, isIOS]);

  const dismissBanner = useCallback(() => {
    setShowBanner(false);
    setShowIOSInstructions(false);
    localStorage.setItem(PWA_DISMISSED_KEY, Date.now().toString());
  }, []);

  /**
   * Request push notification permission and subscribe to push via SW
   */
  const subscribeToPush = useCallback(async (): Promise<boolean> => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.log("[Push] Push not supported in this browser.");
      return false;
    }

    try {
      // Request permission
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== "granted") {
        console.log("[Push] Permission denied.");
        return false;
      }

      // Get VAPID key from server
      const { publicKey } = await api.get("/push/vapid-key");
      if (!publicKey) {
        console.error("[Push] No VAPID public key from server.");
        return false;
      }

      // Get SW registration
      const registration = await navigator.serviceWorker.ready;

      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        console.log("[Push] Already subscribed, sending to server.");
        await api.authPost("/push/subscribe", { subscription: subscription.toJSON() });
        return true;
      }

      // Subscribe
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      console.log("[Push] Subscribed:", subscription.endpoint);

      // Send subscription to server
      await api.authPost("/push/subscribe", { subscription: subscription.toJSON() });
      return true;
    } catch (err) {
      console.error("[Push] Subscription error:", err);
      return false;
    }
  }, []);

  const canInstall = !isInstalled && !isStandalone && (!!deferredPrompt || isIOS);

  return {
    canInstall,
    isInstalled,
    isIOS,
    isStandalone,
    showBanner,
    showIOSInstructions,
    setShowIOSInstructions,
    installApp,
    dismissBanner,
    pushPermission,
    subscribeToPush,
  };
}

/**
 * Injects iOS splash screen meta tags for various device sizes
 */
function injectIOSSplashScreens() {
  if (document.querySelector('link[rel="apple-touch-startup-image"]')) return;

  // iOS splash screen configurations (common device sizes)
  const splashScreens = [
    // iPhone 15 Pro Max, 14 Pro Max
    { width: 1290, height: 2796, ratio: 3 },
    // iPhone 15 Pro, 14 Pro
    { width: 1179, height: 2556, ratio: 3 },
    // iPhone 15, 15 Plus, 14, 14 Plus, 13, 13 Pro, 12, 12 Pro
    { width: 1170, height: 2532, ratio: 3 },
    // iPhone 13 mini, 12 mini
    { width: 1080, height: 2340, ratio: 3 },
    // iPhone 11 Pro Max, XS Max
    { width: 1242, height: 2688, ratio: 3 },
    // iPhone 11, XR
    { width: 828, height: 1792, ratio: 2 },
    // iPhone 11 Pro, X, XS
    { width: 1125, height: 2436, ratio: 3 },
    // iPhone 8 Plus
    { width: 1242, height: 2208, ratio: 3 },
    // iPhone 8, SE2, SE3
    { width: 750, height: 1334, ratio: 2 },
    // iPad Pro 12.9"
    { width: 2048, height: 2732, ratio: 2 },
    // iPad Pro 11"
    { width: 1668, height: 2388, ratio: 2 },
    // iPad Air, iPad 10th gen
    { width: 1640, height: 2360, ratio: 2 },
    // iPad Mini 6th gen
    { width: 1488, height: 2266, ratio: 2 },
    // iPad 9th gen
    { width: 1620, height: 2160, ratio: 2 },
  ];

  for (const screen of splashScreens) {
    const link = document.createElement("link");
    link.rel = "apple-touch-startup-image";
    link.href = "/splash.svg";
    link.setAttribute(
      "media",
      `(device-width: ${screen.width / screen.ratio}px) and (device-height: ${screen.height / screen.ratio}px) and (-webkit-device-pixel-ratio: ${screen.ratio})`
    );
    document.head.appendChild(link);
  }
}

/**
 * Fetches settings and applies the appropriate PWA icon.
 * If a custom icon is configured, uses it. Otherwise, generates a canvas icon.
 * Also updates the manifest dynamically when a custom icon is set.
 */
async function applyPWAIcon() {
  let iconUrl: string | null = null;

  try {
    const settings = await api.get("/admin/settings");
    if (settings?.pwaIconUrl) {
      iconUrl = settings.pwaIconUrl;
    }
  } catch (e) {
    console.log("[PWA] Could not fetch settings for custom icon, using default.", e);
  }

  // If no custom icon, generate one with Canvas
  if (!iconUrl) {
    iconUrl = await generateAppIcon();
  }

  // Apply to <head>
  setIconLinks(iconUrl);

  // If custom icon, also update the manifest dynamically so Android uses it
  if (iconUrl && !iconUrl.startsWith("data:")) {
    updateManifestWithIcon(iconUrl);
  }
}

function setIconLinks(iconUrl: string) {
  // Favicon
  const existingFavicon = document.querySelector('link[rel="icon"]');
  if (existingFavicon) existingFavicon.remove();
  const favicon = document.createElement("link");
  favicon.rel = "icon";
  favicon.type = "image/png";
  favicon.href = iconUrl;
  document.head.appendChild(favicon);

  // Apple touch icon - CRITICAL for iOS home screen
  const existingTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (existingTouchIcon) existingTouchIcon.remove();
  const touchIcon = document.createElement("link");
  touchIcon.rel = "apple-touch-icon";
  touchIcon.setAttribute("sizes", "180x180");
  touchIcon.href = iconUrl;
  document.head.appendChild(touchIcon);

  // Also add without sizes attribute for maximum compatibility
  const existingPrecomposed = document.querySelector('link[rel="apple-touch-icon-precomposed"]');
  if (existingPrecomposed) existingPrecomposed.remove();
  const touchIcon2 = document.createElement("link");
  touchIcon2.rel = "apple-touch-icon-precomposed";
  touchIcon2.href = iconUrl;
  document.head.appendChild(touchIcon2);
}

/**
 * Replaces the static manifest.json link with a dynamic blob manifest
 * that includes the custom icon URL for Android PWA install.
 */
function updateManifestWithIcon(iconUrl: string) {
  const manifest = {
    name: "SpaceFood",
    short_name: "SpaceFood",
    description: "Uma experiencia gastronomica de outro mundo.",
    start_url: "/",
    id: "/",
    display: "standalone",
    background_color: "#fff5f0",
    theme_color: "#ff4500",
    orientation: "portrait",
    categories: ["food", "lifestyle"],
    icons: [
      { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: iconUrl, sizes: "180x180", type: "image/png", purpose: "maskable" },
    ],
  };

  const blob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
  const blobUrl = URL.createObjectURL(blob);

  const existingManifest = document.querySelector('link[rel="manifest"]');
  if (existingManifest) existingManifest.remove();

  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = blobUrl;
  document.head.appendChild(link);
}

/**
 * Generates a PNG icon directly using Canvas 2D API
 * Matches the sidebar logo: #ff4500 bg + white plate/fork/knife/check icon
 */
function generateAppIcon(): Promise<string> {
  return new Promise((resolve) => {
    const size = 180;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==");
      return;
    }

    // Polyfill ctx.roundRect for Chrome < 99 and older browsers
    if (!ctx.roundRect) {
      (ctx as any).roundRect = function (x: number, y: number, w: number, h: number, r: number | number[]) {
        const rad = Array.isArray(r) ? (r[0] ?? 0) : r;
        this.beginPath();
        this.moveTo(x + rad, y);
        this.lineTo(x + w - rad, y);
        this.arcTo(x + w, y, x + w, y + rad, rad);
        this.lineTo(x + w, y + h - rad);
        this.arcTo(x + w, y + h, x + w - rad, y + h, rad);
        this.lineTo(x + rad, y + h);
        this.arcTo(x, y + h, x, y + h - rad, rad);
        this.lineTo(x, y + rad);
        this.arcTo(x, y, x + rad, y, rad);
        this.closePath();
      };
    }

    // === Background: solid #ff4500 with rounded corners ===
    const r = size * 0.18;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fillStyle = "#ff4500";
    ctx.fill();

    ctx.save();
    ctx.clip();

    const shineGrad = ctx.createLinearGradient(0, 0, size, size);
    shineGrad.addColorStop(0, "rgba(255,255,255,0.12)");
    shineGrad.addColorStop(0.5, "rgba(255,255,255,0)");
    ctx.fillStyle = shineGrad;
    ctx.fillRect(0, 0, size, size);

    const s = size / 500;
    const cx = size / 2;
    const cy = size / 2;

    ctx.strokeStyle = "white";
    ctx.fillStyle = "white";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Plate
    ctx.beginPath();
    ctx.arc(cx, cy, 94.5 * s, 0, Math.PI * 2);
    ctx.lineWidth = 5.5;
    ctx.stroke();

    // Inner circle
    ctx.beginPath();
    ctx.arc(cx, cy, 62 * s, 0, Math.PI * 2);
    ctx.lineWidth = 4.5;
    ctx.stroke();

    // Checkmark
    ctx.beginPath();
    ctx.lineWidth = 5.5;
    const chkScale = s * 1.0;
    ctx.moveTo(cx - 22 * chkScale, cy - 1 * chkScale);
    ctx.lineTo(cx - 6.5 * chkScale, cy + 14 * chkScale);
    ctx.lineTo(cx + 22 * chkScale, cy - 14 * chkScale);
    ctx.stroke();

    // Fork
    const forkX = cx + 141 * s;
    const forkTopY = cy - 110 * s;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(forkX - 11 * s, forkTopY);
    ctx.lineTo(forkX - 11 * s, forkTopY + 34 * s);
    ctx.quadraticCurveTo(forkX - 11 * s, forkTopY + 56 * s, forkX, forkTopY + 56 * s);
    ctx.quadraticCurveTo(forkX + 11 * s, forkTopY + 56 * s, forkX + 11 * s, forkTopY + 34 * s);
    ctx.lineTo(forkX + 11 * s, forkTopY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(forkX, forkTopY);
    ctx.lineTo(forkX, forkTopY + 40 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.lineWidth = 4.5;
    ctx.moveTo(forkX, forkTopY + 56 * s);
    ctx.lineTo(forkX, forkTopY + 140 * s);
    const hW = 5.5 * s;
    const hH = 40 * s;
    const hY = forkTopY + 140 * s;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(forkX - hW, hY, hW * 2, hH, 4 * s);
    ctx.lineWidth = 4;
    ctx.stroke();

    // Knife
    const knifeX = cx - 141 * s;
    const knifeTopY = cy - 110 * s;
    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.moveTo(knifeX - 8 * s, knifeTopY);
    ctx.lineTo(knifeX - 8 * s, knifeTopY + 90 * s);
    ctx.lineTo(knifeX + 8 * s, knifeTopY + 90 * s);
    ctx.quadraticCurveTo(knifeX + 8 * s, knifeTopY + 20 * s, knifeX - 8 * s, knifeTopY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(knifeX, knifeTopY + 90 * s);
    ctx.lineTo(knifeX, knifeTopY + 140 * s);
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(knifeX - hW, knifeTopY + 140 * s, hW * 2, hH, 4 * s);
    ctx.lineWidth = 4;
    ctx.stroke();

    // Sparkles
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    const lineLen = 16 * s;
    const lineOffset = 108 * s;
    const angles = [-Math.PI / 4, -3 * Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4];
    for (const angle of angles) {
      const x1 = cx + Math.cos(angle) * lineOffset;
      const y1 = cy + Math.sin(angle) * lineOffset;
      const x2 = cx + Math.cos(angle) * (lineOffset + lineLen);
      const y2 = cy + Math.sin(angle) * (lineOffset + lineLen);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.lineWidth = 2.5;
    const shortLen = 10 * s;
    const shortAngles = [-Math.PI / 8, -7 * Math.PI / 8, Math.PI / 8, 7 * Math.PI / 8];
    for (const angle of shortAngles) {
      const x1 = cx + Math.cos(angle) * (lineOffset + 4 * s);
      const y1 = cy + Math.sin(angle) * (lineOffset + 4 * s);
      const x2 = cx + Math.cos(angle) * (lineOffset + 4 * s + shortLen);
      const y2 = cy + Math.sin(angle) * (lineOffset + 4 * s + shortLen);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.restore();
    resolve(canvas.toDataURL("image/png"));
  });
}