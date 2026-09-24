export interface ShopStockEntry {
  defId: string;
  price: number;
}

export interface ShopDef {
  id: string;
  name: string;
  stock: ShopStockEntry[];
}

export const SHOPS: Record<string, ShopDef> = {
  reclamationPost: {
    id: 'reclamationPost',
    name: 'Reclamation Post',
    stock: [
      { defId: 'machete', price: 14 },
      { defId: 'scrapSpear', price: 16 },
      { defId: 'pipeWrench', price: 12 },
      { defId: 'throwingKnife', price: 9 },
      { defId: 'dart', price: 3 },
      { defId: 'paddedVest', price: 22 },
      { defId: 'medPack', price: 6 },
    ],
  },
};
