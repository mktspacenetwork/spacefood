

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  calories: number;
  category: "Principal" | "Guarnição" | "Salada" | "Sobremesa" | "Bebida";
  image: string;
  limit: number;
  available: number;
  unit: string;
}

export const menuItems: MenuItem[] = [
  {
    id: "1",
    name: "Filé de Frango Grelhado",
    description: "Filé de peito de frango temperado com ervas finas e grelhado.",
    calories: 160,
    category: "Principal",
    image: "https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?w=800&auto=format&fit=crop&q=60",
    limit: 1,
    available: 50,
    unit: "filé",
  },
  {
    id: "2",
    name: "Picadinho de Carne",
    description: "Cubos de carne bovina cozidos lentamente com legumes.",
    calories: 220,
    category: "Principal",
    image: "https://images.unsplash.com/photo-1547496502-ffa22d388bce?w=800&auto=format&fit=crop&q=60",
    limit: 1,
    available: 40,
    unit: "concha",
  },
  {
    id: "3",
    name: "Opção Vegana: Moqueca de Banana",
    description: "Moqueca baiana feita com banana da terra e leite de coco.",
    calories: 180,
    category: "Principal",
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&auto=format&fit=crop&q=60",
    limit: 1,
    available: 20,
    unit: "porção",
  },
  {
    id: "4",
    name: "Arroz Branco",
    description: "Arroz agulhinha soltinho.",
    calories: 130,
    category: "Guarnição",
    image: "https://images.unsplash.com/photo-1516684732162-798a0062be99?w=800&auto=format&fit=crop&q=60",
    limit: 2,
    available: 100,
    unit: "colher",
  },
  {
    id: "5",
    name: "Feijão Carioca",
    description: "Feijão carioca temperado com alho e cebola.",
    calories: 90,
    category: "Guarnição",
    image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&auto=format&fit=crop&q=60",
    limit: 2,
    available: 100,
    unit: "concha",
  },
  {
    id: "6",
    name: "Salada Caesar",
    description: "Alface americana, croutons e molho caesar.",
    calories: 110,
    category: "Salada",
    image: "https://images.unsplash.com/photo-1550304943-4f24f54ddde9?w=800&auto=format&fit=crop&q=60",
    limit: 1,
    available: 45,
    unit: "porção",
  },
  {
    id: "7",
    name: "Mix de Folhas",
    description: "Alface, rúcula e agrião.",
    calories: 20,
    category: "Salada",
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&auto=format&fit=crop&q=60",
    limit: 1,
    available: 50,
    unit: "porção",
  },
  {
    id: "8",
    name: "Gelatina de Morango",
    description: "Gelatina sabor morango diet.",
    calories: 40,
    category: "Sobremesa",
    image: "https://images.unsplash.com/photo-1505253758473-96b701d8feae?w=800&auto=format&fit=crop&q=60",
    limit: 1,
    available: 60,
    unit: "unidade",
  },
  {
    id: "9",
    name: "Suco de Laranja Natural",
    description: "Suco da fruta espremida na hora.",
    calories: 110,
    category: "Bebida",
    image: "https://images.unsplash.com/photo-1613478223719-2ab802602423?w=800&auto=format&fit=crop&q=60",
    limit: 1,
    available: 40,
    unit: "copo",
  },
];
