import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { toast } from "sonner";
import { MenuItem, CartItem } from "../types";
import { api } from "../lib/api";

interface CartContextType {
  items: CartItem[];
  addToCart: (item: MenuItem) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, delta: number) => void;
  clearCart: () => void;
  submitOrder: (consumptionMode: string, deliveryAddress?: string, contactPhone?: string, userName?: string) => Promise<boolean>;
  totalCalories: number;
  totalItems: number;
  getItemQuantity: (itemId: string) => number;
  orderDate: Date;
  setOrderDate: (date: Date) => void;
  selectedUnit: string;
  setSelectedUnit: (unit: string) => void;
  consumptionMode: string;
  setConsumptionMode: (mode: string) => void;
  isManualLog: boolean;
  setIsManualLog: (v: boolean) => void;
  // When set, the next successful submitOrder replaces this order (non-destructive edit).
  editingOrderId: string | null;
  setEditingOrderId: (id: string | null) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = "space-food-cart";

// ── Prato Principal rules ──────────────────────────────────────────────────
// Ovo/Omelete são tratados como "substituição": só um deles (nem entre si)
// pode estar no pedido, e nenhum outro Prato Principal combina com eles.
// Os demais Pratos Principais podem ser combinados livremente entre si, mas
// no máximo 1 porção de cada — o campo `limit` cadastrado no item não se
// aplica nesse caso.
export const PRATO_PRINCIPAL = "Prato Principal";

const SUBSTITUTION_KEYWORDS = ["ovo", "ovos", "omelete", "omeletes"];
function isSubstitutionItem(name: string): boolean {
  const normalized = (name || "").toLowerCase();
  // Word-boundary match: "Frango ao Molho Provolone" contém a substring "ovo"
  // mas não é Ovo/Omelete.
  return SUBSTITUTION_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`).test(normalized));
}

export function canAddPratoPrincipal(
  prev: CartItem[],
  item: MenuItem,
  delta = 1
): { allowed: boolean; message?: string } {
  const ppItems = prev.filter((i) => i.category === PRATO_PRINCIPAL);
  const itemIsSubstitution = isSubstitutionItem(item.name);
  const hasSubstitutionInCart = ppItems.some((i) => isSubstitutionItem(i.name));
  const existing = ppItems.find((i) => i.id === item.id);

  if (itemIsSubstitution || hasSubstitutionInCart) {
    const others = ppItems.filter((i) => i.id !== item.id);
    if (others.length > 0) {
      return {
        allowed: false,
        message:
          "Ovo/Omelete é uma opção exclusiva de Prato Principal. Remova o item atual para escolher outro.",
      };
    }
    if (existing && existing.quantity + delta > item.limit) {
      return {
        allowed: false,
        message: `Limite de ${item.limit} porção(ões) de "${item.name}" atingido.`,
      };
    }
    return { allowed: true };
  }

  const currentQty = existing ? existing.quantity : 0;
  if (currentQty + delta > 1) {
    return {
      allowed: false,
      message: `Você já escolheu "${item.name}". Prato Principal permite no máximo 1 porção de cada opção.`,
    };
  }

  return { allowed: true };
}
// ──────────────────────────────────────────────────────────────────────────

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      // Discard a cart left over from a previous day. Without this, items from an
      // earlier attempt or an abandoned edit (e.g. rice) linger in the bag and the
      // user sees things they didn't select this session.
      const storedDate = localStorage.getItem(CART_STORAGE_KEY + "-date");
      const today = new Date().toISOString().split("T")[0];
      if (storedDate && storedDate !== today) {
        localStorage.removeItem(CART_STORAGE_KEY);
        localStorage.removeItem(CART_STORAGE_KEY + "-editing-order-id");
        return [];
      }
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return [];
  });

  const [orderDate, setOrderDate] = useState<Date>(() => {
    const storedDate = localStorage.getItem(CART_STORAGE_KEY + "-order-date");
    return storedDate ? new Date(storedDate) : new Date();
  });

  const [selectedUnit, setSelectedUnit] = useState<string>(() => {
    const storedUnit = localStorage.getItem(CART_STORAGE_KEY + "-unit");
    // Auto-fix typo: "Damaceno" → "Damasceno"
    if (storedUnit === "Sede Damaceno") {
      const fixed = "Sede Damasceno";
      localStorage.setItem(CART_STORAGE_KEY + "-unit", fixed);
      return fixed;
    }
    return storedUnit || "Sede Damasceno";
  });

  const [consumptionMode, setConsumptionMode] = useState<string>(() => {
    const storedMode = localStorage.getItem(CART_STORAGE_KEY + "-mode");
    return storedMode || "dine_in_damasceno";
  });

  const [isManualLog, setIsManualLog] = useState<boolean>(() => {
    return localStorage.getItem(CART_STORAGE_KEY + "-manual-log") === "true";
  });

  const [editingOrderId, setEditingOrderId] = useState<string | null>(() => {
    return localStorage.getItem(CART_STORAGE_KEY + "-editing-order-id") || null;
  });

  useEffect(() => {
    if (editingOrderId) localStorage.setItem(CART_STORAGE_KEY + "-editing-order-id", editingOrderId);
    else localStorage.removeItem(CART_STORAGE_KEY + "-editing-order-id");
  }, [editingOrderId]);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    localStorage.setItem(CART_STORAGE_KEY + "-date", new Date().toISOString().split('T')[0]);
  }, [items]);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY + "-order-date", orderDate.toISOString());
  }, [orderDate]);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY + "-unit", selectedUnit);
  }, [selectedUnit]);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY + "-mode", consumptionMode);
  }, [consumptionMode]);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY + "-manual-log", String(isManualLog));
  }, [isManualLog]);

  const addToCart = (item: MenuItem) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === item.id);

      // ── Prato Principal special rules ──
      if (item.category === PRATO_PRINCIPAL) {
        const check = canAddPratoPrincipal(prev, item, 1);
        if (!check.allowed) {
          toast.warning(check.message!);
          return prev;
        }
        if (existing) {
          return prev.map((i) =>
            i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
          );
        }
        return [...prev, { ...item, quantity: 1 }];
      }

      // ── Other categories: respect per-item authorized portion count ──
      const currentQty = existing ? existing.quantity : 0;
      if (currentQty + 1 > item.limit) {
        toast.warning(
          `Limite de ${item.limit} porção(ões) de "${item.name}" atingido.`
        );
        return prev;
      }

      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setItems((prev) => {
      const itemToUpdate = prev.find((i) => i.id === itemId);
      if (!itemToUpdate) return prev;

      if (delta < 0) {
        // Decrease — always allowed (removal handled by caller)
        return prev.map((item) => {
          if (item.id === itemId) {
            const newQuantity = item.quantity + delta;
            if (newQuantity <= 0) return item;
            return { ...item, quantity: newQuantity };
          }
          return item;
        });
      }

      // Increase — apply rules
      if (itemToUpdate.category === PRATO_PRINCIPAL) {
        const check = canAddPratoPrincipal(prev, itemToUpdate, delta);
        if (!check.allowed) {
          toast.warning(check.message!);
          return prev;
        }
      } else {
        // Per-item limit check: each item has its own authorized portion count
        if (itemToUpdate.quantity + delta > itemToUpdate.limit) {
          toast.warning(
            `Limite de ${itemToUpdate.limit} porção(ões) de "${itemToUpdate.name}" atingido.`
          );
          return prev;
        }
      }

      return prev.map((item) =>
        item.id === itemId ? { ...item, quantity: item.quantity + delta } : item
      );
    });
  };

  const clearCart = () => {
    setItems([]);
    setEditingOrderId(null);
  };

  const totalCalories = items.reduce((acc, item) => acc + item.calories * item.quantity, 0);
  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);

  const submitOrder = async (consumptionMode: string, deliveryAddress?: string, contactPhone?: string, userName?: string) => {
    if (items.length === 0) {
      toast.error("Seu carrinho está vazio.");
      return false;
    }
    try {
      await api.authPost("/orders", {
        items,
        totalCalories,
        totalItems,
        userName: userName || "Usuário",
        consumptionMode,
        deliveryAddress,
        contactPhone,
        date: orderDate.toISOString(),
        isManualLog,
        // Non-destructive edit: backend removes the old order only after this succeeds.
        replaceOrderId: editingOrderId || undefined,
      });
      if (isManualLog) {
        toast.success("Refeição registrada com sucesso!");
      } else {
        toast.success(editingOrderId ? "Pedido atualizado com sucesso!" : "Pedido realizado com sucesso!");
      }
      clearCart();
      return true;
    } catch (error: any) {
      console.error("Order error:", error);
      toast.error(error.message || "Erro ao enviar. Tente novamente.");
      return false;
    }
  };

  const getItemQuantity = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    return item ? item.quantity : 0;
  };

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        submitOrder,
        totalCalories,
        totalItems,
        getItemQuantity,
        orderDate,
        setOrderDate,
        selectedUnit,
        setSelectedUnit,
        consumptionMode,
        setConsumptionMode,
        isManualLog,
        setIsManualLog,
        editingOrderId,
        setEditingOrderId,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}