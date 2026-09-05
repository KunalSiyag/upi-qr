export type ProductCategory =
  | "standees"
  | "stickers"
  | "printers"
  | "speakers"
  | "outdoor"
  | "transport";

export interface ProductFaq {
  question: string;
  answer: string;
}

export interface ProductSpec {
  label: string;
  value: string;
}

export interface HardwareProduct {
  slug: string;
  name: string;
  shortName: string;
  tag: string;
  category: ProductCategory;
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  h1: string;
  intro: string;
  body: string[];
  bestFor: string;
  printInsert: string;
  generatorHref: string;
  generatorLabel: string;
  priceEst: string;
  lowPrice: string;
  highPrice: string;
  affiliateUrl: string;
  imgSrc: string;
  imgWidth: number;
  imgHeight: number;
  imgAlt: string;
  imgCaption: string;
  ogImageId: string;
  specs: ProductSpec[];
  steps: { name: string; text: string }[];
  faqs: ProductFaq[];
  relatedSlugs: string[];
  guideHref: string;
  guideLabel: string;
}

export const AMAZON_TAG = "kunalworks-21";

export function amazonSearch(keywords: string): string {
  const params = new URLSearchParams({
    k: keywords,
    tag: AMAZON_TAG,
    linkCode: "ll2",
  });
  return `https://www.amazon.in/s?${params.toString()}`;
}

export const PRODUCT_CATEGORIES: { id: ProductCategory; label: string; blurb: string }[] = [
  { id: "standees", label: "Standees & frames", blurb: "Acrylic T-stands, wooden holders, table tents, and wall frames." },
  { id: "stickers", label: "Stickers", blurb: "Waterproof vinyl and magnetic discs for glass, metal, and parcels." },
  { id: "printers", label: "Printers & paper", blurb: "80 mm Bluetooth printers and thermal rolls for receipts." },
  { id: "speakers", label: "Speakers", blurb: "Counter speakers for payment alerts — not an official soundbox." },
  { id: "outdoor", label: "Outdoor boards", blurb: "Sunboard standees that survive sun, rain, and a busy pavement." },
  { id: "transport", label: "Cabs & autos", blurb: "Dashboard clips that keep a QR readable without blocking the meter." },
];

export const PRODUCTS: HardwareProduct[] = [
  {
    slug: "acrylic-qr-standee",
    name: "Acrylic QR Standee (A6 Size)",
    shortName: "A6 acrylic standee",
    tag: "Most Popular",
    category: "standees",
    featured: true,
    seoTitle: "Acrylic UPI QR Standee A6 | Pro UPI QR",
    seoDescription:
      "A6 acrylic T-stand for shop counters. Print a free UPI QR, slide it in, and test-scan from PhonePe and GPay before the lunch rush.",
    h1: "A6 acrylic UPI QR standee for shop counters",
    intro:
      "The A6 acrylic T-stand is the default checkout display in Indian kirana shops, clinics, and cafes. It holds a 10.5 × 14.8 cm insert, keeps the QR upright at arm’s length, and does not need a PhonePe or bank kit.",
    body: [
      "Counter scans fail from glare, a tiny module, or a standee that lies flat. An A6 T-stand lifts the code to about chest height for a standing customer. Print the QR at least 2.5–3 cm on the short side, on matte stock, and leave a white quiet zone. NPCI does not mandate one print size — match the module to the scan distance.",
      "This site generates a standard upi://pay poster you can print at home or at a copy shop. Slide the print into the acrylic pocket. It is not an official PhonePe, Google Pay, or bank merchant standee. Official KYC kits and rented soundboxes still come from those apps.",
      "Buy a double-sided standee if both the queue and the cashier need to see the same VPA. Replace the insert when you change UPI IDs — a static print cannot be edited in place.",
    ],
    bestFor: "Kirana counters, billing desks, clinics, and cafes with a 1–1.5 m scan distance.",
    printInsert: "A6 (105 × 148 mm) or a 5×7 inch photo insert with 3 mm quiet zone.",
    generatorHref: "/",
    generatorLabel: "Generate a free UPI standee",
    priceEst: "Under ₹300",
    lowPrice: "149",
    highPrice: "399",
    affiliateUrl: "https://amzn.to/4vJnYC5",
    imgSrc: "/images/product-acrylic.png",
    imgWidth: 522,
    imgHeight: 522,
    imgAlt: "Clear A6 acrylic T-standee for a printed UPI QR card",
    imgCaption: "A6 acrylic T-stand. Print a matte insert and test-scan from two UPI apps before you leave it on the counter.",
    ogImageId: "kirana-upi-standee",
    specs: [
      { label: "Typical size", value: "A6 pocket, ~10.5 × 14.8 cm insert" },
      { label: "Material", value: "Clear acrylic, T-base or gold-trim base" },
      { label: "QR module", value: "At least 2.5–3 cm short side" },
      { label: "Finish", value: "Matte insert; skip glossy lamination" },
    ],
    steps: [
      { name: "Generate the QR", text: "Enter your VPA and payee name in the free UPI generator. Leave amount blank for an open counter QR." },
      { name: "Print matte A6", text: "Download PNG or PDF and print at 300 DPI on matte photo paper or 300 GSM card." },
      { name: "Insert and test-scan", text: "Slide the print into the acrylic pocket. Scan from PhonePe and Google Pay at the real checkout distance." },
    ],
    faqs: [
      {
        question: "What size insert fits an A6 acrylic QR standee?",
        answer:
          "A6 is 105 × 148 mm. Many Amazon T-stands also take a 5×7 inch photo. Measure the pocket before you order a bulk print run.",
      },
      {
        question: "Will this standee work with PhonePe and Google Pay?",
        answer:
          "Yes, if the insert encodes a valid upi://pay VPA. Customers scan from any member app. The acrylic is not an official PhonePe or GPay kit.",
      },
      {
        question: "Why does the printed QR glare under tube lights?",
        answer:
          "Glossy lamination reflects checkout lighting. Use matte stock or matte laminate and keep a white quiet zone around the module.",
      },
      {
        question: "Can I change the UPI ID without buying a new standee?",
        answer:
          "Reuse the acrylic. Reprint the insert, or point a dynamic QR at a new destination. Always test-scan after a VPA change.",
      },
    ],
    relatedSlugs: ["a5-acrylic-t-stand", "waterproof-qr-stickers", "wooden-qr-holder"],
    guideHref: "/blog/how-to-create-print-upi-qr-code-standee/",
    guideLabel: "Standee printing guide",
  },
  {
    slug: "wooden-qr-holder",
    name: "Premium Wooden QR Card Holder",
    shortName: "Wooden QR holder",
    tag: "Elegant Design",
    category: "standees",
    featured: true,
    seoTitle: "Wooden UPI QR Card Holder | Pro UPI QR",
    seoDescription:
      "Wooden QR stand for boutiques, clinics, and cafes. Print a compact UPI card, drop it in the window, and keep the counter looking like a desk — not a POS pile.",
    h1: "Wooden UPI QR card holder for boutiques and clinics",
    intro:
      "A wooden holder is for counters where a gold-trim acrylic T-stand looks out of place: clinics, studios, jewellery, and cafes. The QR still has to be large enough to scan. Pretty wood does not fix a 1 cm module.",
    body: [
      "Most wooden stands take a credit-card or 8×8 cm window. Print a high-contrast black-on-white QR with a quiet zone inside that window. Dark wood around a dark code is the usual failure mode — keep the card itself white.",
      "Generate a compact counter card from the homepage or the salon and freelance presets. Cut it to the window, not to the outer silhouette of the wood. If the stand is single-sided, face it at the queue, not at the cashier.",
      "Wood does not like wet counters. Keep it off the tea-stall drip tray; use vinyl stickers or acrylic there instead.",
    ],
    bestFor: "Boutiques, clinics, photo studios, and cafe pastry counters.",
    printInsert: "Card-size or ~8×8 cm square with a white quiet zone.",
    generatorHref: "/salon-qr-generator/",
    generatorLabel: "Open the salon QR generator",
    priceEst: "Under ₹400",
    lowPrice: "199",
    highPrice: "599",
    affiliateUrl: "https://amzn.to/4xpYco3",
    imgSrc: "/images/product-wooden.png",
    imgWidth: 522,
    imgHeight: 419,
    imgAlt: "Light wooden arched stand holding a printed UPI QR payment card",
    imgCaption: "Wooden QR window. Keep the insert white and high-contrast so the module does not disappear into the grain.",
    ogImageId: "upi-qr-hardware-products",
    specs: [
      { label: "Typical window", value: "Card-size to 8×8 cm" },
      { label: "Material", value: "MDF, plywood, or engraved hardwood" },
      { label: "QR module", value: "At least 2 cm inside the window" },
      { label: "Care", value: "Wipe dry; not for wet tea-stall counters" },
    ],
    steps: [
      { name: "Measure the window", text: "Note the inner opening, not the outer wood. Leave 3 mm quiet zone inside that opening." },
      { name: "Print a compact card", text: "Use a salon, freelance, or homepage template. Export PNG at 300 DPI on matte card." },
      { name: "Seat and scan", text: "Drop the card in the window, face the queue, and test-scan from 60–90 cm." },
    ],
    faqs: [
      {
        question: "Is a wooden QR stand better than acrylic?",
        answer:
          "It looks calmer on a clinic or boutique desk. Acrylic is tougher on wet kirana counters and usually cheaper to replace if it cracks.",
      },
      {
        question: "What print size fits a wooden QR holder?",
        answer:
          "Measure the inner window. Many take a 5.5×8.5 cm card. Do not scale a full A4 poster down — regenerate at the real size.",
      },
      {
        question: "Can I engrave the QR into the wood?",
        answer:
          "Avoid it. Engraved or laser-burned modules lose contrast and quiet zone. Keep a printed white card in the window.",
      },
      {
        question: "Does the wood need an official merchant QR?",
        answer:
          "No. Any valid upi://pay print works. Official PhonePe or bank kits are a separate product if you need KYC dashboards.",
      },
    ],
    relatedSlugs: ["acrylic-qr-standee", "table-tent-qr-holder", "a5-acrylic-t-stand"],
    guideHref: "/print-templates/",
    guideLabel: "Printable template gallery",
  },
  {
    slug: "bluetooth-thermal-printer",
    name: "Wireless Bluetooth Thermal Printer",
    shortName: "80 mm thermal printer",
    tag: "Billing Essential",
    category: "printers",
    featured: true,
    seoTitle: "Bluetooth Thermal Printer 80mm | Pro UPI QR",
    seoDescription:
      "80 mm Bluetooth thermal printer for UPI receipts, delivery slips, and cab bills. Pair it with a free receipt QR — it does not replace a printed standee.",
    h1: "80 mm Bluetooth thermal printer for UPI receipts",
    intro:
      "A thermal printer is for the slip in the customer’s hand, not for the QR on the counter. Delivery riders, cabs, and kirana billing desks use 80 mm Bluetooth models because they need no ink and run off a phone.",
    body: [
      "Most pocket printers speak ESC/POS over Bluetooth. They print 58 mm or 80 mm paper. 80 mm is easier to read for GST invoices; 58 mm is lighter in a rider bag. Neither prints a scannable counter standee — the module on a receipt is small and curls.",
      "Generate the receipt or invoice on this site, then print from your billing app, or keep a printed standee at the counter for walk-ins. A thermal QR on a 58 mm slip is a backup, not a shop display.",
      "This is not a PhonePe or Paytm soundbox, and it is not a POS that settles UPI. Money still moves through the payer’s UPI app into your VPA.",
    ],
    bestFor: "Delivery agents, cabs, kirana billing, and pop-up stalls that issue paper slips.",
    printInsert: "Not an insert. Uses 80 mm (or 58 mm) thermal rolls.",
    generatorHref: "/receipt-generator/",
    generatorLabel: "Open the receipt generator",
    priceEst: "Under ₹2,000",
    lowPrice: "999",
    highPrice: "2499",
    affiliateUrl: "https://amzn.to/4vDBfvM",
    imgSrc: "/images/product-printer.png",
    imgWidth: 768,
    imgHeight: 1024,
    imgAlt: "Black portable Bluetooth thermal receipt printer with a printed sales slip",
    imgCaption: "Pocket 80 mm thermal printer. Use it for receipts; keep a matte standee on the counter for walk-in scans.",
    ogImageId: "upi-qr-hardware-products",
    specs: [
      { label: "Paper", value: "58 mm or 80 mm thermal rolls" },
      { label: "Link", value: "Bluetooth to Android billing apps" },
      { label: "Ink", value: "None — heat-sensitive paper" },
      { label: "Not for", value: "Counter standees or outdoor posters" },
    ],
    steps: [
      { name: "Pick 58 or 80 mm", text: "80 mm for GST invoices; 58 mm for rider bags. Match the roll to the printer throat." },
      { name: "Pair over Bluetooth", text: "Connect from your billing app. Test a blank slip before the first live order." },
      { name: "Keep a counter QR", text: "Print a standee from the UPI generator for walk-ins. Do not rely on the receipt QR as the shop display." },
    ],
    faqs: [
      {
        question: "Is 58 mm or 80 mm better for UPI receipts?",
        answer:
          "80 mm is easier to read and fits a GST invoice. 58 mm is lighter for delivery bags. The printer model must match the roll width.",
      },
      {
        question: "Can a thermal printer replace a UPI standee?",
        answer:
          "No. Receipt QRs are small and curl. Keep a matte acrylic or sticker QR at the counter for walk-in customers.",
      },
      {
        question: "Does this printer connect to PhonePe?",
        answer:
          "It pairs with a phone or billing app over Bluetooth. It does not settle UPI or replace PhonePe Business. Payments still go to your VPA.",
      },
      {
        question: "How long do thermal receipts last?",
        answer:
          "Heat and sunlight fade them in weeks to months. For GST records, keep a PDF from the invoice generator, not only the thermal slip.",
      },
    ],
    relatedSlugs: ["thermal-paper-rolls", "acrylic-qr-standee", "cab-dashboard-qr-holder"],
    guideHref: "/blog/best-billing-apps-with-inbuilt-upi-qr/",
    guideLabel: "Billing apps with inbuilt UPI QR",
  },
  {
    slug: "waterproof-qr-stickers",
    name: "Waterproof Vinyl QR Stickers",
    shortName: "Waterproof QR stickers",
    tag: "Outdoor Ready",
    category: "stickers",
    featured: true,
    seoTitle: "Waterproof UPI QR Stickers | Pro UPI QR",
    seoDescription:
      "Matte vinyl UPI QR stickers for glass, steel, and parcels. Print a free A4 sheet, or buy pre-cut waterproof labels when the counter gets wet.",
    h1: "Waterproof vinyl UPI QR stickers for glass and parcels",
    intro:
      "Vinyl stickers belong on fridge doors, steel tiffins, parcel tape, and wet counters where an acrylic standee slides around. Matte vinyl scans better than gloss on glass.",
    body: [
      "Print 4, 6, or 12 labels per A4 sheet with the sticker generator, then laminate or use self-adhesive vinyl. For outdoor shutters and two-wheelers, buy pre-cut waterproof vinyl so rain does not lift the edge in a week.",
      "Keep a quiet zone inside each sticker. A bleed-to-the-cut QR fails at the first scuff. Round stickers look neat on tiffins; squares pack denser on A4.",
      "A sticker is static. If you change VPA, peel it and reprint, or print a dynamic QR whose destination you can edit. Run a finger over counter stickers each morning — overlay fraud is the usual tamper.",
    ],
    bestFor: "Glass counters, steel tiffins, parcel boxes, fridge doors, and two-wheeler tanks.",
    printInsert: "A4 sheet: 4, 6, or 12 labels. Pre-cut vinyl discs ~5–8 cm.",
    generatorHref: "/qr-sticker-generator/",
    generatorLabel: "Print A4 QR sticker sheets",
    priceEst: "Under ₹250",
    lowPrice: "99",
    highPrice: "399",
    affiliateUrl: amazonSearch("waterproof vinyl qr code stickers"),
    imgSrc: "/images/product-waterproof-stickers.png",
    imgWidth: 520,
    imgHeight: 520,
    imgAlt: "Fan of round and square matte vinyl QR stickers with one corner peeled",
    imgCaption: "Matte vinyl QR stickers. Prefer matte over gloss on glass, and leave a quiet zone inside the cut.",
    ogImageId: "upi-qr-sticker-sheet",
    specs: [
      { label: "Stock", value: "Self-adhesive vinyl, matte face" },
      { label: "Sizes", value: "5–8 cm discs or A4 4/6/12-up sheets" },
      { label: "QR module", value: "At least 2 cm plus quiet zone" },
      { label: "Surface", value: "Glass, steel, plastic — clean and dry first" },
    ],
    steps: [
      { name: "Generate the sheet", text: "Open the A4 sticker generator, enter VPA and shop name, pick 4, 6, or 12 labels." },
      { name: "Print on vinyl", text: "Use self-adhesive vinyl or print on paper and cover with matte laminate. Skip gloss on glass." },
      { name: "Stick and test", text: "Clean the surface, apply without bubbles, and test-scan from PhonePe and GPay." },
    ],
    faqs: [
      {
        question: "Paper sticker or vinyl for a kirana counter?",
        answer:
          "Vinyl if the counter is wiped with a wet cloth. Paper is fine for a week-long stall. Matte beats gloss under tube lights.",
      },
      {
        question: "How many UPI stickers fit on one A4 sheet?",
        answer:
          "The generator prints 4 large, 6 standard, or 12 compact labels per A4 page. Leave a quiet zone inside each cut.",
      },
      {
        question: "Will a waterproof sticker survive a monsoon shutter?",
        answer:
          "Good vinyl lasts a season on a shutter. Direct sun still fades thermal-style prints. For pavement shops, use a sunboard as well.",
      },
      {
        question: "Can someone overlay a fake QR on my sticker?",
        answer:
          "Yes. Feel the surface each morning. Overlay stickers are the common physical tamper. See the QR safety guide.",
      },
    ],
    relatedSlugs: ["magnetic-qr-sticker", "acrylic-qr-standee", "outdoor-sunboard-standee"],
    guideHref: "/blog/how-to-print-durable-waterproof-qr-stickers/",
    guideLabel: "Waterproof sticker guide",
  },
  {
    slug: "table-tent-qr-holder",
    name: "Restaurant Table Tent QR Holder",
    shortName: "Table tent holder",
    tag: "Cafe Essential",
    category: "standees",
    featured: true,
    seoTitle: "Restaurant Table Tent QR Holder | Pro UPI QR",
    seoDescription:
      "Acrylic table tent for cafe and restaurant UPI. Print a two-sided scan-to-pay card, keep the QR 1.5–2 inches, and skip gloss under ceiling lights.",
    h1: "Acrylic table tent QR holder for restaurants and cafes",
    intro:
      "Table tents sit 40–60 cm from the diner. The QR can be smaller than a billing-desk standee, but it still needs a quiet zone and matte stock. Glossy tents under downlights are why cafe QRs fail at dinner.",
    body: [
      "A tent is two-sided. Print the same VPA on both faces so a four-top does not pass the card around. Use the table-tent layout on the print-templates gallery or the restaurant generator.",
      "Keep the module about 1.5–2 inches. Smaller looks tidy and will not scan from the next chair. Larger fights the menu for table space.",
      "Do not put the only shop QR on the table and nowhere else. Guests at the counter still need an A6 standee. Tents walk away; budget for reprints.",
    ],
    bestFor: "Cafes, restaurants, cloud-kitchen pickup shelves, and banquet tables.",
    printInsert: "Folded A6 / 4×6 in tent, two-sided, matte card.",
    generatorHref: "/restaurant-qr-generator/",
    generatorLabel: "Open the restaurant QR generator",
    priceEst: "Under ₹350",
    lowPrice: "149",
    highPrice: "499",
    affiliateUrl: amazonSearch("acrylic table tent card holder restaurant"),
    imgSrc: "/images/product-table-tent.png",
    imgWidth: 520,
    imgHeight: 520,
    imgAlt: "Clear acrylic table tent holding a SCAN PAY UPI QR card",
    imgCaption: "Two-sided acrylic tent. Print matte inserts and keep the module about 1.5–2 inches for table distance.",
    ogImageId: "format-table-tent",
    specs: [
      { label: "Format", value: "Folded tent, ~A6 / 4×6 in" },
      { label: "Sides", value: "Two — same VPA on both" },
      { label: "QR module", value: "1.5–2 in (about 4–5 cm)" },
      { label: "Stock", value: "Matte card; skip gloss laminate" },
    ],
    steps: [
      { name: "Pick the tent layout", text: "Use the restaurant generator or the table-tent template. Encode the same VPA on both faces." },
      { name: "Print matte", text: "300 DPI on 300 GSM matte card. Fold only after the ink dries so the module does not crack." },
      { name: "Seat one per table", text: "Place at the condiment edge, not under the napkin pile. Test-scan from a seated diner’s phone." },
    ],
    faqs: [
      {
        question: "How large should a table-tent UPI QR be?",
        answer:
          "About 1.5–2 inches on the short side for a seated diner. Billing desks need 2.5–3 cm or more. See the print size chart.",
      },
      {
        question: "One tent per table or one at the counter?",
        answer:
          "Both. Tents walk away. Keep an A6 standee at the billing desk as the source of truth for the VPA.",
      },
      {
        question: "Can I put the menu QR and the UPI QR on the same tent?",
        answer:
          "Yes, on opposite faces, labelled clearly. A single unmarked QR that sometimes pays and sometimes opens a menu confuses diners.",
      },
      {
        question: "Do I need a different QR per table?",
        answer:
          "Only if you want table-wise notes in the UPI tn field. Most cafes print one VPA and write the table number on the bill.",
      },
    ],
    relatedSlugs: ["acrylic-qr-standee", "a4-wall-poster-frame", "waterproof-qr-stickers"],
    guideHref: "/print-templates/",
    guideLabel: "Table tent template",
  },
  {
    slug: "thermal-paper-rolls",
    name: "80mm Thermal Paper Rolls",
    shortName: "80 mm paper rolls",
    tag: "Consumable",
    category: "printers",
    featured: false,
    seoTitle: "80mm Thermal Paper Rolls | Pro UPI QR",
    seoDescription:
      "80 mm thermal rolls for UPI receipts and GST slips. Match width to the printer throat, store them away from sun, and keep a PDF copy of each invoice.",
    h1: "80 mm thermal paper rolls for UPI receipts",
    intro:
      "Thermal rolls are the consumable behind every Bluetooth printer. Wrong width jams the throat. Sun and a hot dash fade the print. Buy the width your printer actually takes.",
    body: [
      "Check the printer spec: 57/58 mm or 80 mm. Indian GST invoices are easier to read on 80 mm. Rider printers often take 58 mm. A 50 m roll is the usual shop pack; 20 m is a travel spare.",
      "Thermal paper is heat-sensitive. Do not store rolls on a dashboard or near the tea kettle. For records that must last, download the PDF from the invoice or receipt generator — the slip is a customer copy, not the archive.",
      "BPA-free rolls exist if you handle paper all day. They cost more and still fade in sun.",
    ],
    bestFor: "Shops already using an 80 mm or 58 mm thermal printer.",
    printInsert: "Not an insert. Consumable for thermal printers.",
    generatorHref: "/invoice-generator/",
    generatorLabel: "Open the invoice generator",
    priceEst: "Under ₹400 / pack",
    lowPrice: "199",
    highPrice: "699",
    affiliateUrl: amazonSearch("80mm thermal paper roll 50 meters"),
    imgSrc: "/images/product-thermal-rolls.png",
    imgWidth: 520,
    imgHeight: 520,
    imgAlt: "Stack of white 80 millimetre thermal paper rolls on a white background",
    imgCaption: "80 mm thermal rolls. Match the width to the printer, and keep a PDF archive because thermal ink fades.",
    ogImageId: "upi-qr-hardware-products",
    specs: [
      { label: "Widths", value: "58 mm or 80 mm — match the printer" },
      { label: "Length", value: "Typically 20–50 m per roll" },
      { label: "Storage", value: "Cool, dark shelf — not a dashboard" },
      { label: "Archive", value: "Keep PDF invoices; slips fade" },
    ],
    steps: [
      { name: "Read the printer throat", text: "Confirm 58 mm or 80 mm before you order a pack of ten." },
      { name: "Load the roll", text: "Feed under the lid so the coated face meets the print head. Print a test slip." },
      { name: "Archive in PDF", text: "Use the invoice or receipt generator for a lasting copy. Do not rely on the thermal slip alone." },
    ],
    faqs: [
      {
        question: "Will 58 mm rolls fit an 80 mm printer?",
        answer:
          "No. The throat is sized to one width. Order the millimetres printed on the printer body or in the manual.",
      },
      {
        question: "Why did my UPI receipt fade in a week?",
        answer:
          "Heat, sun, and PVC sleeves attack thermal coating. Store slips in a paper file and keep the PDF from this site.",
      },
      {
        question: "How many receipts does a 50 m roll print?",
        answer:
          "Roughly 400–700 short slips, depending on invoice length. GST invoices with item lines use more paper.",
      },
      {
        question: "Do I need a QR on every thermal receipt?",
        answer:
          "Helpful for the next order, useless as the shop display. Keep a standee at the counter for walk-ins.",
      },
    ],
    relatedSlugs: ["bluetooth-thermal-printer", "acrylic-qr-standee", "cab-dashboard-qr-holder"],
    guideHref: "/receipt-generator/",
    guideLabel: "Free receipt generator",
  },
  {
    slug: "a5-acrylic-t-stand",
    name: "A5 Acrylic T-Stand for UPI QR",
    shortName: "A5 T-stand",
    tag: "Larger Display",
    category: "standees",
    featured: true,
    seoTitle: "A5 Acrylic T-Stand for UPI QR | Pro UPI QR",
    seoDescription:
      "A5 acrylic T-stand for donation desks, clinics, and billing counters that sit farther than arm’s length. Print a 2.5–3 inch QR on matte A5 stock.",
    h1: "A5 acrylic T-stand for longer-distance UPI scans",
    intro:
      "A5 (148 × 210 mm) is the step up from A6 when the customer stands farther away: temple donation desks, clinic waiting rooms, parking kiosks. The QR itself should grow with the paper, not stay a postage stamp on a big sheet.",
    body: [
      "Rule of thumb from the print-size guide: scan distance ÷ 10 ≈ minimum QR width in inches. A 5-foot counter wants about a 2-inch (5 cm) module. A5 gives you room for payee name, a short note, and that module without crowding.",
      "Print at 300 DPI. PDF is the safer print-shop master because it keeps the A5 page box. PNG is fine for a home inkjet. Do not stretch an A6 screenshot onto A5.",
      "Double-sided T-stands help if people approach from both sides of a donation table. Test-scan from the real queue position, not from your desk chair.",
    ],
    bestFor: "Donation desks, clinics, parking kiosks, and billing counters past 1.5 m.",
    printInsert: "A5 (148 × 210 mm) at 300 DPI, matte.",
    generatorHref: "/",
    generatorLabel: "Generate an A5 UPI poster",
    priceEst: "Under ₹450",
    lowPrice: "249",
    highPrice: "699",
    affiliateUrl: amazonSearch("acrylic t stand a5 size"),
    imgSrc: "/images/product-a5-stand.png",
    imgWidth: 520,
    imgHeight: 520,
    imgAlt: "Clear A5 acrylic T-stand with a gold base holding a Scan to Pay QR card",
    imgCaption: "A5 T-stand. Grow the QR module with the paper — a tiny code on a large sheet still fails at 5 feet.",
    ogImageId: "format-a5-counter-card",
    specs: [
      { label: "Page", value: "A5, 148 × 210 mm" },
      { label: "QR module", value: "About 2–3 in for 5-foot scans" },
      { label: "Print", value: "300 DPI PDF or PNG, matte" },
      { label: "Base", value: "T-stand, often double-sided" },
    ],
    steps: [
      { name: "Set A5 in the generator", text: "Use the homepage standee templates. Keep payee name short so the module stays large." },
      { name: "Export PDF", text: "PDF keeps the A5 page box for a print shop. PNG is fine for home inkjet at 300 DPI." },
      { name: "Insert and walk the queue", text: "Stand where the customer stands and scan from PhonePe and GPay." },
    ],
    faqs: [
      {
        question: "A6 or A5 for a kirana billing desk?",
        answer:
          "A6 is enough at arm’s length. Choose A5 when the queue stands farther away or you want a larger payee name.",
      },
      {
        question: "Can I print an A4 poster and trim it to A5?",
        answer:
          "You can, but the QR may end up off-centre. Better to export A5 from the generator so the module is composed for that page.",
      },
      {
        question: "Does a larger standee scan better?",
        answer:
          "Only if the QR module is larger. A huge sheet with a 1 cm code is worse than a small A6 with a 3 cm code.",
      },
      {
        question: "Is A5 an official NPCI size?",
        answer:
          "No. NPCI does not mandate one print size. A5 is a stationery size that happens to fit many acrylic T-stands.",
      },
    ],
    relatedSlugs: ["acrylic-qr-standee", "a4-wall-poster-frame", "outdoor-sunboard-standee"],
    guideHref: "/blog/upi-qr-code-size-dimensions-printing-guide/",
    guideLabel: "UPI QR print size guide",
  },
  {
    slug: "magnetic-qr-sticker",
    name: "Magnetic UPI QR Sticker",
    shortName: "Magnetic QR sticker",
    tag: "Metal Surfaces",
    category: "stickers",
    featured: false,
    seoTitle: "Magnetic UPI QR Sticker | Pro UPI QR",
    seoDescription:
      "Magnetic UPI QR for fridges, steel tiffins, auto bodies, and toolboxes. Print a high-contrast disc, stick it on clean metal, and reprint when the VPA changes.",
    h1: "Magnetic UPI QR sticker for fridges, autos, and toolboxes",
    intro:
      "Magnets belong on metal: fridge doors in a PG kitchen, tiffin boxes, toolbox lids, and some auto bodies. They move without peeling paint. They fall off plastic dashboards — use a clip there.",
    body: [
      "Print a round or square disc with a 2 cm-plus module and a white quiet zone. Fridge magnets that wrap the QR in a photo collage usually fail to scan. Keep the face simple.",
      "Clean the metal. Dust and oil kill magnet grip on a two-wheeler tank. Do not put the only shop QR on a magnet that a child can walk away with — keep a fixed standee at the counter too.",
      "A magnet is still a static print. Changing UPI ID means reprinting. Dynamic QR helps if you reprint onto the same disc artwork.",
    ],
    bestFor: "Fridge doors, steel tiffins, toolboxes, and metal auto panels.",
    printInsert: "5–8 cm magnetic disc, high-contrast QR, white quiet zone.",
    generatorHref: "/qr-sticker-generator/",
    generatorLabel: "Generate a compact QR sticker",
    priceEst: "Under ₹200",
    lowPrice: "79",
    highPrice: "299",
    affiliateUrl: amazonSearch("magnetic qr code sticker"),
    imgSrc: "/images/product-magnetic-sticker.png",
    imgWidth: 520,
    imgHeight: 520,
    imgAlt: "Round magnetic QR sticker next to a small metal tin and disc magnets",
    imgCaption: "Magnetic QR disc for metal. Keep the face high-contrast and do not rely on it as the only shop QR.",
    ogImageId: "upi-qr-sticker-sheet",
    specs: [
      { label: "Surface", value: "Ferrous metal only" },
      { label: "Size", value: "5–8 cm disc typical" },
      { label: "QR module", value: "At least 2 cm plus quiet zone" },
      { label: "Not for", value: "Plastic dashboards, glass, wood" },
    ],
    steps: [
      { name: "Print a compact QR", text: "Use the sticker generator. Keep payee text off the module." },
      { name: "Mount on clean metal", text: "Wipe oil and dust. Confirm the magnet actually grips before you ride off." },
      { name: "Keep a backup display", text: "A magnet walks. Leave an acrylic standee or vinyl sticker at the main counter." },
    ],
    faqs: [
      {
        question: "Will a magnetic QR stick to a plastic car dash?",
        answer:
          "No. Magnets need ferrous metal. Use a dashboard clip for cabs and a vinyl sticker for plastic fairings.",
      },
      {
        question: "Is a fridge magnet large enough to scan?",
        answer:
          "Yes if the module is at least 2 cm with a quiet zone. Decorative magnets with tiny codes will not scan from a phone.",
      },
      {
        question: "Can I move the magnet between tiffin boxes?",
        answer:
          "That is the point. Wipe both surfaces so grit does not scratch the print. Test-scan after each move.",
      },
      {
        question: "Does a magnet interfere with UPI?",
        answer:
          "No. UPI is a camera scan of a printed pattern. The magnet only holds the disc on metal.",
      },
    ],
    relatedSlugs: ["waterproof-qr-stickers", "cab-dashboard-qr-holder", "acrylic-qr-standee"],
    guideHref: "/blog/printable-upi-qr-sticker-sheet-guide/",
    guideLabel: "A4 sticker sheet guide",
  },
  {
    slug: "payment-alert-speaker",
    name: "Shop Payment Alert Speaker",
    shortName: "Payment speaker",
    tag: "Counter Audio",
    category: "speakers",
    featured: false,
    seoTitle: "Shop Payment Alert Speaker | Pro UPI QR",
    seoDescription:
      "A small Bluetooth speaker can read payment alerts on a noisy counter. It is not a PhonePe or Paytm soundbox. Official boxes still come from those apps.",
    h1: "Counter speaker for UPI payment alerts — not an official soundbox",
    intro:
      "A rented PhonePe or Paytm soundbox speaks the amount because those apps own the merchant notification. A generic Bluetooth speaker can only play whatever your phone already announces. That distinction matters in search results and on the counter.",
    body: [
      "If you are on PhonePe Business or Google Pay for Business, turn on in-app voice alerts first. Many shops never need a rented box. A cheap speaker next to the phone is loud enough for a quiet clinic; a tea stall at peak hour may still want the official box.",
      "This site does not sell or certify soundboxes. We will not claim NPCI affiliation. Pair a printed UPI standee with whatever audio path you actually have: phone speaker, Bluetooth speaker, or official rented box.",
      "Keep the printed QR honest. A speaker does not make an overlay-tampered sticker safe. Feel the standee each morning.",
    ],
    bestFor: "Quiet counters that already get payment notifications on a phone.",
    printInsert: "None. Pair with any printed UPI QR standee.",
    generatorHref: "/",
    generatorLabel: "Print the matching UPI standee",
    priceEst: "Under ₹800",
    lowPrice: "399",
    highPrice: "1499",
    affiliateUrl: amazonSearch("bluetooth speaker for shop counter"),
    imgSrc: "/images/product-payment-speaker.png",
    imgWidth: 520,
    imgHeight: 520,
    imgAlt: "Compact black Bluetooth speaker beside a small acrylic Scan to Pay QR stand",
    imgCaption: "Generic counter speaker. Official PhonePe or Paytm soundboxes are a separate rented product.",
    ogImageId: "upi-soundbox-tea-stall",
    specs: [
      { label: "What it is", value: "Bluetooth speaker for phone alerts" },
      { label: "What it is not", value: "Official PhonePe / Paytm soundbox" },
      { label: "Needs", value: "A phone that already receives UPI notifications" },
      { label: "QR", value: "Still required — audio does not collect money" },
    ],
    steps: [
      { name: "Print a standee", text: "Generate a UPI QR for your VPA and display it at the counter." },
      { name: "Enable app voice alerts", text: "PhonePe Business and GPay for Business can speak amounts on the phone. Try that before you rent a box." },
      { name: "Add a speaker only if needed", text: "Pair Bluetooth if the phone is too quiet. For a roaring tea stall, consider the official rented soundbox instead." },
    ],
    faqs: [
      {
        question: "Is this the same as a PhonePe soundbox?",
        answer:
          "No. Official soundboxes subscribe to that app’s merchant notifications. A Bluetooth speaker only repeats what the phone already plays.",
      },
      {
        question: "Do I need a soundbox to collect UPI?",
        answer:
          "No. A printed QR is enough. Audio is a confirmation aid in noisy shops, not a payment rail.",
      },
      {
        question: "Can a speaker confirm a payment that never arrived?",
        answer:
          "It can only speak a notification the phone received. Always match the amount in the official app or SMS, not the speaker alone.",
      },
      {
        question: "Where can I read how official soundboxes work?",
        answer:
          "See the soundbox safety guide on this site. It covers notification-listener DIY boxes versus rented official units.",
      },
    ],
    relatedSlugs: ["acrylic-qr-standee", "bluetooth-thermal-printer", "a5-acrylic-t-stand"],
    guideHref: "/blog/how-upi-soundboxes-work-and-their-safety/",
    guideLabel: "How UPI soundboxes work",
  },
  {
    slug: "a4-wall-poster-frame",
    name: "A4 UPI QR Wall Poster Frame",
    shortName: "A4 wall frame",
    tag: "Door & Wall",
    category: "standees",
    featured: false,
    seoTitle: "A4 UPI QR Wall Poster Frame | Pro UPI QR",
    seoDescription:
      "A4 acrylic wall frame for shop doors, clinic corridors, and donation halls. Print a 3–4 inch UPI QR at 300 DPI and hang it at chest height.",
    h1: "A4 wall frame for UPI QR posters on doors and corridors",
    intro:
      "Wall frames are for people who walk up, not for people who already stand at a billing desk. Hang at chest height, keep the module 3–4 inches, and avoid a glossy frame under a tube light at the door.",
    body: [
      "A4 is 210 × 297 mm — the default donation poster and shutter sign. Use the homepage generator or the offer-poster tool if you also want a sale headline. PDF keeps the page box for a print shop.",
      "Clip frames with four standoffs look clean on a clinic corridor. Snap frames are faster to change after a VPA update. Outdoor doors still want sunboard or vinyl, not paper in a clip frame.",
      "Do not hang the only QR behind the cashier’s head. Walk-in customers look at the desk first. A wall frame is a second copy, not a replacement for the A6 standee.",
    ],
    bestFor: "Shop doors, clinic corridors, temple halls, and notice boards.",
    printInsert: "A4 (210 × 297 mm), 3–4 inch QR, 300 DPI.",
    generatorHref: "/offer-poster-generator/",
    generatorLabel: "Build an A4 offer poster",
    priceEst: "Under ₹500",
    lowPrice: "199",
    highPrice: "799",
    affiliateUrl: amazonSearch("a4 acrylic wall frame poster"),
    imgSrc: "/images/product-a4-frame.png",
    imgWidth: 520,
    imgHeight: 520,
    imgAlt: "A4 acrylic clip frame on a wall holding a Scan to Pay UPI QR poster",
    imgCaption: "A4 clip frame. Hang at chest height and keep a desk standee as well — doors are a second copy, not the only copy.",
    ogImageId: "format-a4-standee",
    specs: [
      { label: "Page", value: "A4, 210 × 297 mm" },
      { label: "QR module", value: "3–4 in for a walking approach" },
      { label: "Mount", value: "Clip frame or snap frame, chest height" },
      { label: "Outdoor", value: "Use sunboard or vinyl instead of paper" },
    ],
    steps: [
      { name: "Generate A4", text: "Homepage standee or offer-poster tool. Keep the payee name large and the module 3–4 inches." },
      { name: "Print 300 DPI", text: "PDF for a print shop. Matte laminate if the corridor has strong lights." },
      { name: "Hang and test", text: "Chest height, not above a door. Scan from a walking stop about 1.5 m away." },
    ],
    faqs: [
      {
        question: "A4 frame or A6 standee for a small shop?",
        answer:
          "Start with A6 on the desk. Add A4 on the door if people pay before they reach the counter.",
      },
      {
        question: "Will an A4 paper poster survive a shutter?",
        answer:
          "Not through monsoon. Use waterproof vinyl or a sunboard outdoors. Paper frames belong indoors.",
      },
      {
        question: "Can I put a sale offer and a UPI QR in the same frame?",
        answer:
          "Yes — that is what the offer-poster generator is for. Keep the QR’s quiet zone clear of clip hardware.",
      },
      {
        question: "How often should I reprint a wall QR?",
        answer:
          "Whenever the VPA changes, and whenever a test-scan fails. Faded ink is a common six-month failure in sunlit corridors.",
      },
    ],
    relatedSlugs: ["a5-acrylic-t-stand", "outdoor-sunboard-standee", "acrylic-qr-standee"],
    guideHref: "/blog/how-to-create-print-upi-qr-code-standee/",
    guideLabel: "How to print a UPI standee",
  },
  {
    slug: "cab-dashboard-qr-holder",
    name: "Cab Dashboard UPI QR Holder",
    shortName: "Dashboard QR clip",
    tag: "Transit",
    category: "transport",
    featured: false,
    seoTitle: "Cab Dashboard UPI QR Holder | Pro UPI QR",
    seoDescription:
      "Dashboard clip for taxi and auto UPI cards. Print a compact high-contrast QR, mount it without blocking the meter, and keep a spare in the door pocket.",
    h1: "Dashboard clip for taxi and auto UPI QR cards",
    intro:
      "Cabs and autos need a QR that a rear-seat passenger can scan without the driver handing over a phone. A spring clip or visor clip beats tape on the glove box. Keep it off the meter and the airbag path.",
    body: [
      "Print a compact card from the cab-driver generator. High contrast, short payee name, optional amount left blank so fares can vary. A fixed-amount QR is only for a flat prepaid hop.",
      "Mount on the passenger-facing side of the dash or on a visor the rider can see. Do not stick vinyl over the meter glass. RTO and app-partner rules still apply — this clip does not replace an official fleet QR if your aggregator issues one.",
      "Carry a spare card. Sun fades dashboard prints fast. A thermal printer in the bag is optional for a paper slip; the clip is the display.",
    ],
    bestFor: "Taxi drivers, auto rickshaws, and delivery riders who collect in the vehicle.",
    printInsert: "Credit-card to 6×9 cm compact card, high contrast.",
    generatorHref: "/cab-driver-qr-generator/",
    generatorLabel: "Open the cab & auto QR generator",
    priceEst: "Under ₹250",
    lowPrice: "99",
    highPrice: "399",
    affiliateUrl: amazonSearch("car dashboard card holder clip"),
    imgSrc: "/images/product-cab-holder.png",
    imgWidth: 520,
    imgHeight: 520,
    imgAlt: "Black dashboard spring clip holding a compact Pay Here UPI QR card",
    imgCaption: "Dash clip for a compact UPI card. Face it at the passenger, keep it off the meter, and reprint when the sun fades it.",
    ogImageId: "format-counter-card",
    specs: [
      { label: "Mount", value: "Spring clip, visor clip, or suction" },
      { label: "Card", value: "Credit-card to 6×9 cm" },
      { label: "QR module", value: "At least 2 cm, high contrast" },
      { label: "Avoid", value: "Meter glass, airbag panels, windscreen centre" },
    ],
    steps: [
      { name: "Generate a cab card", text: "Use the taxi & auto generator. Leave amount blank unless the hop is a flat fare." },
      { name: "Print compact", text: "Matte card, 300 DPI. Laminate lightly if you want wipe-clean; skip thick gloss." },
      { name: "Clip facing the rider", text: "Passenger sightline, off the meter. Test-scan from the back seat, not from the driver’s phone." },
    ],
    faqs: [
      {
        question: "Can I use my personal UPI ID in a cab?",
        answer:
          "Yes within that bank’s personal limits. Fleet or aggregator QRs are a separate requirement if your partner issues one.",
      },
      {
        question: "Should the cab QR include a fixed amount?",
        answer:
          "Usually no. Fares change. Leave amount blank so the rider types the meter total. Use a fixed QR only for a prepaid hop.",
      },
      {
        question: "Vinyl sticker or clip on the dash?",
        answer:
          "Clip if you want to move the card between vehicles. Vinyl on a metal panel is fine; magnets fail on plastic dashes.",
      },
      {
        question: "Why did the dashboard QR stop scanning?",
        answer:
          "Sun fade, a cracked laminate, or a card that slipped behind the meter. Reprint every few months and test from the back seat.",
      },
    ],
    relatedSlugs: ["waterproof-qr-stickers", "bluetooth-thermal-printer", "magnetic-qr-sticker"],
    guideHref: "/cab-driver-qr-generator/",
    guideLabel: "Taxi & auto UPI QR generator",
  },
  {
    slug: "outdoor-sunboard-standee",
    name: "Outdoor Sunboard UPI QR Standee",
    shortName: "Sunboard standee",
    tag: "Pavement",
    category: "outdoor",
    featured: false,
    seoTitle: "Outdoor Sunboard UPI QR Standee | Pro UPI QR",
    seoDescription:
      "A3 sunboard UPI standee for pavement shops, temple gates, and parking lots. Print a 5 cm-plus QR, use a weighted base, and reprint after a monsoon.",
    h1: "Outdoor sunboard UPI QR standee for pavement and gates",
    intro:
      "Sunboard (foam board) is the cheap outdoor cousin of acrylic. It stands at a temple gate, parking entrance, or pavement stall where an A6 T-stand would blow over. The QR must be larger because people scan from farther away.",
    body: [
      "For outdoor boards, keep the module 5 cm or more. A3 (297 × 420 mm) is a common print-shop size. Use a weighted metal foot or sandbag — a light board on a windy flyover is a liability, not a payment method.",
      "Rain warps untreated foam. Ask the shop for a weatherproof laminate, or reprint after monsoon. Direct sun still fades ink; a six-month outdoor print is a fair life.",
      "Generate the artwork here, take the PDF to a local print shop, and do not stretch a phone screenshot. This is not an official NPCI board.",
    ],
    bestFor: "Pavement stalls, temple gates, parking lots, and outdoor donation desks.",
    printInsert: "A3 sunboard, 5 cm-plus QR, weatherproof laminate.",
    generatorHref: "/donation-qr-generator/",
    generatorLabel: "Generate a donation poster",
    priceEst: "Under ₹600",
    lowPrice: "249",
    highPrice: "999",
    affiliateUrl: amazonSearch("sunboard standee a3 outdoor"),
    imgSrc: "/images/product-sunboard.png",
    imgWidth: 520,
    imgHeight: 520,
    imgAlt: "A3 foam-board Scan to Pay standee in a metal foot for outdoor UPI display",
    imgCaption: "Sunboard outdoor standee. Grow the QR to 5 cm or more and weight the base so wind does not take it.",
    ogImageId: "print-formats-overview",
    specs: [
      { label: "Board", value: "A3 sunboard / foam board typical" },
      { label: "QR module", value: "5 cm or more" },
      { label: "Base", value: "Weighted metal foot or sandbag" },
      { label: "Life", value: "A season outdoors; reprint after monsoon" },
    ],
    steps: [
      { name: "Export a large poster", text: "Donation or homepage generator. Keep the module at least 5 cm on A3." },
      { name: "Print on sunboard", text: "Local print shop, weatherproof laminate, 300 DPI PDF master." },
      { name: "Weight the base", text: "Metal foot or sandbag. Test-scan from the pavement distance, not from arm’s length." },
    ],
    faqs: [
      {
        question: "Sunboard or acrylic for a pavement stall?",
        answer:
          "Sunboard is cheaper and larger. Acrylic is better on a dry indoor desk. Many shops use both: A3 outside, A6 on the table.",
      },
      {
        question: "How big should an outdoor UPI QR be?",
        answer:
          "5 cm or more on the short side. Use scan distance ÷ 10 in inches as the floor. See the print size guide.",
      },
      {
        question: "Will sunboard survive monsoon?",
        answer:
          "With laminate, a season. Untreated foam boards warp. Budget a reprint, or switch to vinyl on a shutter.",
      },
      {
        question: "Can I change the UPI ID on a sunboard?",
        answer:
          "Not without reprinting, unless you used a dynamic QR. Paste-over stickers on outdoor boards are how overlay fraud starts — reprint the whole face.",
      },
    ],
    relatedSlugs: ["a4-wall-poster-frame", "waterproof-qr-stickers", "a5-acrylic-t-stand"],
    guideHref: "/blog/upi-qr-code-size-dimensions-printing-guide/",
    guideLabel: "Print size and scan distance",
  },
];

export const PRODUCT_HUB = {
  seoTitle: "UPI QR Standee, Stickers & Printers | Pro UPI QR",
  seoDescription:
    "Acrylic standees, table tents, waterproof stickers, thermal printers, and outdoor boards. Pair each with a free printable UPI QR from Pro UPI QR.",
  h1: "UPI QR standees, stickers, printers, and counter hardware",
  intro:
    "These are physical displays and billing extras Indian shops actually put next to a printed UPI QR. Each page is a buying guide with sizes, scan-distance notes, and a generator link. Amazon Associate links are labelled. They do not change QR generation or calculator math.",
};

const BY_SLUG = new Map(PRODUCTS.map((product) => [product.slug, product]));

export function getProduct(slug: string): HardwareProduct | undefined {
  return BY_SLUG.get(slug);
}

export function featuredProducts(): HardwareProduct[] {
  return PRODUCTS.filter((product) => product.featured);
}

export function productsInCategory(category: ProductCategory): HardwareProduct[] {
  return PRODUCTS.filter((product) => product.category === category);
}

export function relatedProducts(product: HardwareProduct): HardwareProduct[] {
  return product.relatedSlugs
    .map((slug) => BY_SLUG.get(slug))
    .filter((item): item is HardwareProduct => Boolean(item));
}

export const PRODUCT_ROUTE_SLUGS = ["products", ...PRODUCTS.map((product) => `products/${product.slug}`)];
