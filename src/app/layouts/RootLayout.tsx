import { useEffect } from "react";
import { Outlet } from "react-router";
import { AuthProvider } from "../context/auth-context";
import { CartProvider } from "../context/cart-context";
import { NotificationProvider } from "../context/notification-context";
import { NotificationSync } from "../components/NotificationSync";
import { InAppPushToast } from "../components/InAppPushToast";
import { Toaster } from "../components/ui/sonner";

export function RootLayout() {
  return (
    <AuthProvider>
      <CartProvider>
        <NotificationProvider>
          <NotificationSync />
          <InAppPushToast />
          <Outlet />
          <Toaster position="top-center" />
        </NotificationProvider>
      </CartProvider>
    </AuthProvider>
  );
}