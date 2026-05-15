/**
 * Barrel re-export file.
 * All context logic has been split into separate files for better maintainability:
 * - auth-context.tsx: AuthProvider, useAuth
 * - cart-context.tsx: CartProvider, useCart
 * - notification-context.tsx: NotificationProvider, useNotifications, AppNotification
 *
 * This file re-exports everything so existing imports (`from "../context/Store"`) continue to work.
 */

export { supabase, AuthProvider, useAuth } from "./auth-context";
export { CartProvider, useCart } from "./cart-context";
export { NotificationProvider, useNotifications } from "./notification-context";
export type { AppNotification } from "./notification-context";
