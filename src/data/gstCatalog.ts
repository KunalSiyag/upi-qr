/**
 * Illustrative GST 2.0 rates for common shop items.
 * 56th GST Council (3 Sep 2025), CBIC notifications 9/2025 & 15/2025-CT(Rate),
 * generally effective 22 Sep 2025. Always confirm the HSN on gst.gov.in before filing.
 */

export type GstCatalogItem = {
  id: string;
  name: string;
  aliases: string[];
  rate: number;
  hsn?: string;
  note?: string;
  group: string;
};

export const GST_SLABS: { rate: number; label: string; hint: string }[] = [
  { rate: 0, label: "0%", hint: "Exempt / nil" },
  { rate: 5, label: "5%", hint: "Merit / essentials" },
  { rate: 18, label: "18%", hint: "Standard" },
  { rate: 40, label: "40%", hint: "Sin / luxury" },
  { rate: 3, label: "3%", hint: "Gold / silver" },
  { rate: 0.25, label: "0.25%", hint: "Rough stones" },
];

export const GST_LEGACY_SLABS: { rate: number; label: string; hint: string }[] = [
  { rate: 12, label: "12%", hint: "Old slab, pre-GST 2.0" },
  { rate: 28, label: "28%", hint: "Old slab, pre-GST 2.0" },
];

export const GST_CATALOG: GstCatalogItem[] = [
  { id: "loose-grain", name: "Loose rice, wheat, atta, dal (unpackaged)", aliases: ["rice", "wheat", "atta", "dal", "grain", "kirana"], rate: 0, hsn: "1006", group: "Kirana", note: "Unpackaged foodgrain is nil-rated; branded pre-packed packs are usually 5%." },
  { id: "fresh-milk", name: "Fresh milk, curd, lassi", aliases: ["milk", "doodh", "curd", "dahi"], rate: 0, hsn: "0401", group: "Kirana" },
  { id: "roti", name: "Roti, chapati, khakhra, pizza bread", aliases: ["roti", "chapati", "khakhra"], rate: 0, hsn: "1905", group: "Kirana" },
  { id: "paneer", name: "Paneer / chena (including pre-packed)", aliases: ["paneer", "chena"], rate: 0, hsn: "0406", group: "Kirana" },
  { id: "books", name: "Printed books, newspapers", aliases: ["book", "newspaper"], rate: 0, hsn: "4901", group: "Education" },
  { id: "life-health-insurance", name: "Individual life / health insurance", aliases: ["insurance", "lic", "health policy"], rate: 0, group: "Services", note: "Individual life and health policies were exempted from 22 Sep 2025." },
  { id: "life-saving-drug", name: "Specified life-saving medicines", aliases: ["medicine", "drug", "pharma"], rate: 0, group: "Pharmacy", note: "Not all medicines are 0%. Check the HSN on the GST rate finder." },

  { id: "packaged-food", name: "Packaged branded atta, rice, snacks", aliases: ["namkeen", "packaged food", "biscuit"], rate: 5, hsn: "1905", group: "Kirana" },
  { id: "edible-oil", name: "Edible oil, ghee, butter", aliases: ["oil", "ghee", "butter", "mustard"], rate: 5, hsn: "1507", group: "Kirana" },
  { id: "sugar-tea", name: "Sugar, tea, coffee, spices", aliases: ["sugar", "tea", "coffee", "masala"], rate: 5, hsn: "0902", group: "Kirana" },
  { id: "soap-paste", name: "Soap, toothpaste, hair oil, shampoo", aliases: ["soap", "toothpaste", "shampoo", "hair oil"], rate: 5, group: "Kirana" },
  { id: "footwear-low", name: "Footwear up to ₹2,500 a pair", aliases: ["chappal", "shoe", "footwear"], rate: 5, group: "Apparel" },
  { id: "apparel-low", name: "Apparel / garments up to ₹2,500 a piece", aliases: ["shirt", "kurta", "dress", "garment", "cloth"], rate: 5, hsn: "61", group: "Apparel" },
  { id: "restaurant-5", name: "Standalone restaurant / cloud kitchen", aliases: ["restaurant", "hotel food", "dine in", "cloud kitchen"], rate: 5, hsn: "9963", group: "Restaurant", note: "5% without ITC is the usual restaurant rate. Hotels charging up to ₹7,500/day also sit here." },
  { id: "beauty", name: "Salon, spa, beauty services", aliases: ["salon", "spa", "parlour", "beauty"], rate: 5, group: "Services", note: "Beauty services: 5% without ITC (56th Council)." },
  { id: "medicine-5", name: "Most other medicines / diagnostics", aliases: ["tablet", "syrup", "clinic"], rate: 5, group: "Pharmacy" },
  { id: "tractor", name: "Tractor, irrigation, agri machinery", aliases: ["tractor", "pump", "agri"], rate: 5, hsn: "8701", group: "Hardware" },

  { id: "it-freelance", name: "IT, design, writing, consulting", aliases: ["freelance", "software", "consulting", "agency", "sac 9983"], rate: 18, hsn: "9983", group: "Services" },
  { id: "telecom", name: "Mobile / broadband / telecom", aliases: ["airtel", "jio", "wifi", "broadband"], rate: 18, group: "Services" },
  { id: "commercial-rent", name: "Commercial rent / shop lease", aliases: ["rent", "lease", "shop rent"], rate: 18, group: "Services" },
  { id: "mobile", name: "Mobile phones and accessories", aliases: ["phone", "smartphone", "charger"], rate: 18, hsn: "8517", group: "Electronics" },
  { id: "laptop", name: "Laptops, computers, printers", aliases: ["laptop", "computer", "pc"], rate: 18, hsn: "8471", group: "Electronics" },
  { id: "white-goods", name: "AC, fridge, washing machine, TV", aliases: ["ac", "fridge", "tv", "washing machine"], rate: 18, group: "Electronics", note: "Most white goods moved from 28% to 18% under GST 2.0." },
  { id: "cement", name: "Cement and most building material", aliases: ["cement", "paint", "hardware"], rate: 18, hsn: "2523", group: "Hardware" },
  { id: "small-car", name: "Small car / bike up to 350cc", aliases: ["car", "bike", "scooter"], rate: 18, hsn: "8703", group: "Auto" },
  { id: "apparel-high", name: "Apparel / garments above ₹2,500 a piece", aliases: ["designer", "suit"], rate: 18, hsn: "61", group: "Apparel" },
  { id: "footwear-high", name: "Footwear above ₹2,500 a pair", aliases: ["boots", "sports shoe"], rate: 18, group: "Apparel" },
  { id: "hotel-restaurant", name: "Hotel restaurant / specified catering", aliases: ["5 star", "banquet", "catering"], rate: 18, hsn: "9963", group: "Restaurant" },

  { id: "gold", name: "Gold / silver jewellery", aliases: ["gold", "silver", "jewel", "ornament"], rate: 3, hsn: "7113", group: "Jewellery" },
  { id: "rough-stone", name: "Rough precious / semi-precious stones", aliases: ["diamond", "ruby", "rough"], rate: 0.25, group: "Jewellery" },
  { id: "imitation", name: "Imitation jewellery", aliases: ["artificial jewellery", "fashion jewellery"], rate: 18, group: "Jewellery" },

  { id: "aerated", name: "Aerated drinks, caffeinated beverages", aliases: ["cola", "soda", "soft drink"], rate: 40, group: "Sin / luxury" },
  { id: "tobacco", name: "Cigarettes, pan masala, gutkha", aliases: ["cigarette", "tobacco", "gutkha"], rate: 40, group: "Sin / luxury" },
  { id: "luxury-car", name: "Luxury car / bike above 350cc", aliases: ["suv", "bmw", "harley"], rate: 40, hsn: "8703", group: "Auto" },
  { id: "online-gaming", name: "Online money gaming, casinos, betting", aliases: ["gaming", "casino", "betting"], rate: 40, group: "Sin / luxury" },
];

export function searchGstCatalog(query: string, limit = 8): GstCatalogItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored = GST_CATALOG.map((item) => {
    const hay = `${item.name} ${item.aliases.join(" ")} ${item.group} ${item.hsn ?? ""}`.toLowerCase();
    let score = 0;
    if (item.name.toLowerCase().startsWith(q)) score += 8;
    if (item.aliases.some((a) => a.startsWith(q))) score += 6;
    if (hay.includes(q)) score += 3;
    q.split(/\s+/).forEach((part) => {
      if (part && hay.includes(part)) score += 1;
    });
    return { item, score };
  }).filter((row) => row.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((row) => row.item);
}
