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
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = "space-food-cart";

// ── Prato Principal rules ──────────────────────────────────────────────────
// Rule 1: OVO or OMELETE (identified by name) is EXCLUSIVE with any other
//         Prato Principal. Once one of them is in the cart, no other main
//         dish can be added, and vice-versa.
// Rule 2: For non-egg main dishes the total across all selected Prato
//         Principal items must not exceed 2 (can be 1+1 or 2 of the same).
const PRATO_PRINCIPAL = "Prato Principal";

function isEggItem(item: { name: string }): boolean {
  const n = item.name.toLowerCase();
  return n.includes("ovo") || n.includes("omelete");
}

function canAddPratoPrincipal(
  prev: CartItem[],
  item: MenuItem,
  delta = 1
): { allowed: boolean; message?: string } {
  const ppItems = prev.filter((i) => i.category === PRATO_PRINCIPAL);
  const addingEgg = isEggItem(item);
  const hasEgg = ppItems.some((i) => isEggItem(i));
  const hasNonEgg = ppItems.some((i) => !isEggItem(i));

  if (addingEgg) {
    // Cannot mix egg with non-egg
    if (hasNonEgg) {
      return {
        allowed: false,
        message:
          "Ovo e Omelete sao exclusivos — remova os outros pratos principais primeiro.",
      };
    }
    // Each egg item is limited to 1 portion
    const existing = ppItems.find((i) => i.id === item.id);
    const currentQty = existing ? existing.quantity : 0;
    if (currentQty + delta > 1) {
      return {
        allowed: false,
        message: "Maximo de 1 porcao de Ovo ou Omelete por pedido.",
      };
    }
  } else {
    // Cannot add non-egg when egg already in cart
    if (hasEgg) {
      return {
        allowed: false,
        message:
          "Nao e possivel adicionar pratos principais quando Ovo ou Omelete ja esta selecionado.",
      };
    }
    // Non-egg total must not exceed 2
    const nonEggTotal = ppItems
      .filter((i) => !isEggItem(i))
      .reduce((acc, cur) => acc + cur.quantity, 0);
    if (nonEggTotal + delta > 2) {
      return {
        allowed: false,
        message:
          "Limite de 2 porcoes de Prato Principal por pedido (1 de cada ou 2 do mesmo).",
      };
    }
  }
  return { allowed: true };
}
// ──────────────────────────────────────────────────────────────────────────

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
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

      // ── Other categories: use item.limit per category ──
      const categoryTotal = prev
        .filter((i) => i.category === item.category)
        .reduce((acc, curr) => acc + curr.quantity, 0);

      if (categoryTotal >= item.limit) {
        toast.warning(
          `Limite de ${item.limit} ${item.limit === 1 ? "item" : "itens"} para a categoria ${item.category} atingido.`
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
        const categoryTotal = prev
          .filter((i) => i.category === itemToUpdate.category)
          .reduce((acc, curr) => acc + curr.quantity, 0);

        if (categoryTotal + delta > itemToUpdate.limit) {
          toast.warning(
            `Limite de ${itemToUpdate.limit} para ${itemToUpdate.category} atingido.`
          );
          return prev;
        }
      }

      return prev.map((item) =>
        item.id === itemId ? { ...item, quantity: item.quantity + delta } : item
      );
    });
  };

  const clearCart = () => setItems([]);

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
      });
      toast.success("Pedido realizado com sucesso!");
      clearCart();
      return true;
    } catch (error: any) {
      console.error("Order error:", error);
      toast.error(error.message || "Erro ao enviar pedido. Tente novamente.");
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