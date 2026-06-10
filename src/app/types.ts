export interface MenuItem {
  id: string;
  name: string;
  description: string;
  calories: number;
  category: string;
  image: string;
  limit: number;
  available: number;
  unit: string;
  portionWeight?: number;
  kitchenUnit?: "kg" | "l" | "un";
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  tip?: string;
  recipe?: string; // Receita / modo de preparo
  unitRestrictions?: string[]; // Vazio = aparece em todas as unidades; preenchido = só nas unidades listadas
  isPreviousDay?: boolean; // Flag para indicar que é do dia anterior
  isNotOnMenu?: boolean; // Flag para indicar que o item existe mas não está no cardápio de hoje
}

export interface CartItem extends MenuItem {
  quantity: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: "admin" | "user" | "kitchen" | "master";
  department?: string;
  phone?: string;
  onboardingCompleted?: boolean;
  customRoleId?: string;
  lunchLocation?: string;
  dietaryRestrictions?: string;
  canOrderMeal?: boolean; // true por padrão; false = usuário não pode fazer pedido
}

export interface Order {
  id: string;
  userId: string;
  userName?: string;
  userAvatar?: string;
  date: string;
  /** Target menu day this order is for (YYYY-MM-DD). May differ from `date` (creation time). */
  menuDate?: string;
  totalCalories: number;
  totalItems?: number;
  status: string;
  items: CartItem[];
  consumptionMode?: 'dine_in_damasceno' | 'dine_in_taipas' | 'takeout_external';
  deliveryAddress?: string;
  contactPhone?: string;
  rating?: number;
  ratingComment?: string;
  ratingDate?: string;
  isManualLog?: boolean; // true = registro diário (Taipas), não envia para cozinha nem decrementa estoque
}

export interface Rating {
  id: string;
  orderId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  userUnit?: string;
  date: string;
  stars: number;
  comment?: string;
}

/** Alias used by admin pages */
export type Review = Rating;

export interface Abstention {
  userId: string;
  userName: string;
  date: string;
}

export interface CheckIn {
  orderId: string;
  userId: string;
  userName: string;
  confirmed: boolean;
  date: string;
}

/** Permission role (custom role with page-level access control) */
export interface PermRole {
  id: string;
  name: string;
  description: string;
  color: string;
  permissions: Record<string, boolean>;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
}