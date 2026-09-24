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
  generalStore: {
    id: 'generalStore',
    name: 'General Store',
    stock: [
      { defId: 'rustySword', price: 12 },
      { defId: 'scrapSpear', price: 14 },
      { defId: 'leatherArmor', price: 20 },
      { defId: 'healingHerb', price: 5 },
    ],
  },
};
