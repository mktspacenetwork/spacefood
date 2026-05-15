export interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: "Principal" | "Guarnição" | "Salada" | "Sobremesa" | "Bebida";
  calories: number;
  image: string;
  limit: number;
  unit: string;
  available: number;
}

export const menuItems: MenuItem[] = [
  {
    id: "1",
    name: "Filé de Frango Grelhado",
    description: "Filé de peito de frango grelhado com ervas finas e limão.",
    category: "Principal",
    calories: 320,
    image: "https://images.unsplash.com/photo-1716034353309-c6066ae24c67?w=800&q=80",
    limit: 1,
    unit: "unidade",
    available: 50,
  },
  {
    id: "2",
    name: "Bife Acebolado",
    description: "Bife de alcatra acebolado no ponto, suculento e macio.",
    category: "Principal",
    calories: 450,
    image: "https://images.unsplash.com/photo-1570263495075-b8258671743f?w=800&q=80",
    limit: 1,
    unit: "unidade",
    available: 40,
  },
  {
    id: "3",
    name: "Salmão Grelhado",
    description: "Posta de salmão grelhado com molho de maracujá.",
    category: "Principal",
    calories: 380,
    image: "https://images.unsplash.com/photo-1557499305-0af888c3d8ec?w=800&q=80",
    limit: 1,
    unit: "unidade",
    available: 20,
  },
  {
    id: "4",
    name: "Macarrão ao Sugo",
    description: "Espaguete ao molho de tomate fresco e manjericão.",
    category: "Principal",
    calories: 350,
    image: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=800&q=80",
    limit: 1,
    unit: "porção",
    available: 60,
  },
  {
    id: "5",
    name: "Arroz Branco",
    description: "Arroz branco soltinho, preparado com alho e cebola.",
    category: "Guarnição",
    calories: 130,
    image: "https://images.unsplash.com/photo-1685079240036-373fa6876d49?w=800&q=80",
    limit: 2,
    unit: "colher",
    available: 100,
  },
  {
    id: "6",
    name: "Purê de Batata",
    description: "Purê de batata cremoso com manteiga e leite.",
    category: "Guarnição",
    calories: 180,
    image: "https://images.unsplash.com/photo-1685079240036-373fa6876d49?w=800&q=80",
    limit: 2,
    unit: "colher",
    available: 80,
  },
  {
    id: "7",
    name: "Salada Caesar",
    description: "Alface americana, croutons, queijo parmesão e molho especial.",
    category: "Salada",
    calories: 120,
    image: "https://images.unsplash.com/photo-1550304943-4f24f54ddde9?w=800&q=80",
    limit: 1,
    unit: "prato",
    available: 45,
  },
  {
    id: "8",
    name: "Mix de Folhas",
    description: "Alface, rúcula e agrião com tomate cereja.",
    category: "Salada",
    calories: 40,
    image: "https://images.unsplash.com/photo-1550304943-4f24f54ddde9?w=800&q=80",
    limit: 1,
    unit: "prato",
    available: 60,
  },
  {
    id: "9",
    name: "Mousse de Chocolate",
    description: "Mousse de chocolate meio amargo aerado.",
    category: "Sobremesa",
    calories: 250,
    image: "https://images.unsplash.com/photo-1590080875852-ba44f83ff2db?w=800&q=80",
    limit: 1,
    unit: "unidade",
    available: 30,
  },
  {
    id: "10",
    name: "Suco de Laranja",
    description: "Suco de laranja natural espremido na hora.",
    category: "Bebida",
    calories: 110,
    image: "https://images.unsplash.com/photo-1641659735894-45046caad624?w=800&q=80",
    limit: 1,
    unit: "copo",
    available: 100,
  },
];

export const adminStats = {
  dailyOrders: 145,
  activeUsers: 320,
  totalCalories: 87000,
  consumptionBySector: [
    { name: "TI", value: 400 },
    { name: "RH", value: 300 },
    { name: "Financeiro", value: 300 },
    { name: "Vendas", value: 200 },
  ],
  popularItems: [
    { name: "Filé de Frango", count: 85 },
    { name: "Bife Acebolado", count: 60 },
    { name: "Salada Caesar", count: 45 },
    { name: "Mousse Chocolate", count: 30 },
  ],
};
