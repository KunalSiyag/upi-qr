export interface GlossaryTerm {
  slug: string;
  term: string;
  full: string;
  hindi: string;
  category: string;
  shortDef: string;
  body: string[];
  faqs: { question: string; answer: string }[];
  related: { href: string; label: string }[];
}

export const GLOSSARY_CATEGORIES = [
  "UPI Basics",
  "Payment Methods",
  "Merchant & QR",
  "Billing & GST"
] as const;

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    slug: "upi",
    term: "UPI",
    full: "Unified Payments Interface",
    hindi: "यूनिफाइड पेमेंट्स इंटरफेस",
    category: "UPI Basics",
    shortDef: "India's instant, 24×7 bank-to-bank payment system run by NPCI — free for everyday merchant collections.",
    body: [
      "Launched by NPCI in 2016, UPI moves money instantly between any two bank accounts using a smartphone app. Instead of sharing account numbers and IFSC codes, users identify each other with a simple UPI ID (VPA) or QR code, and transfers settle within seconds at any hour of any day.",
      "For merchants, UPI is transformative because standard bank-to-bank person-to-merchant payments carry zero MDR — no percentage is deducted from your sale, unlike card machines or payment gateways which typically charge 1–2% plus setup costs. Note that RuPay credit card on UPI transactions above ₹2,000 may carry an interchange fee per NPCI circulars.",
      "Every UPI payment needs two things: a valid VPA linked to a real bank account, and the payer's UPI PIN entered on their own device. No OTPs are ever shared with the payee — anyone asking for your PIN or OTP to 'receive' money is running a scam."
    ],
    faqs: [
      { question: "Is UPI free for merchants?", answer: "Bank-to-bank UPI transactions carry zero MDR — shops receive the full amount. RuPay credit card on UPI transactions above ₹2,000 may have interchange fees per NPCI guidelines." },
      { question: "Does UPI work at night and on holidays?", answer: "Yes — UPI runs 24×7×365, including bank holidays." }
    ],
    related: [
      { href: "/", label: "Create a free UPI QR standee" },
      { href: "/blog/static-vs-dynamic-upi-qr-code-difference/", label: "Static vs dynamic UPI QR explained" }
    ]
  },
  {
    slug: "vpa",
    term: "VPA",
    full: "Virtual Payment Address",
    hindi: "वर्चुअल पेमेंट एड्रेस (UPI आईडी)",
    category: "UPI Basics",
    shortDef: "Your UPI ID — an email-style address like name@okaxis that routes payments to your bank account.",
    body: [
      "A VPA replaces sensitive banking details with a shareable identifier. It always carries an @handle suffix tied to the Payment Service Provider that issued it — @okaxis for Axis, @ybl for Yes Bank (PhonePe's handle), @paytm, @apl, and so on.",
      "One bank account can have multiple VPAs, and a single VPA can be set as default across apps. Payments sent to your VPA land directly in the linked account; nothing is stored with a middleman.",
      "Because VPAs are public-facing, treat them like an email address: safe to print on posters and invoices, but remember that knowing your VPA alone lets someone send you a collect request — never approve requests you did not initiate."
    ],
    faqs: [
      { question: "Can I change my VPA later?", answer: "Yes — most apps let you create new VPAs and delete old ones anytime without affecting incoming payments already printed elsewhere, as long as at least one active VPA remains." },
      { question: "Do both parties need the same bank?", answer: "No. UPI is fully interoperable — an @ybl user can pay an @okhdfcbank user instantly." }
    ],
    related: [
      { href: "/upi-qr-decoder/", label: "Decode a UPI QR to see its VPA" },
      { href: "/upi-link-generator/", label: "Generate a UPI payment link" }
    ]
  },
  {
    slug: "npci",
    term: "NPCI",
    full: "National Payments Corporation of India",
    hindi: "नेशनल पेमेंट्स कॉरपोरेशन ऑफ इंडिया",
    category: "UPI Basics",
    shortDef: "The RBI-founded non-profit that owns and operates UPI, RuPay, IMPS, and other national payment rails.",
    body: [
      "Set up in 2008 by the Reserve Bank of India and the Indian Banks' Association, NPCI is the not-for-profit umbrella organisation behind nearly every domestic retail payment system in India: UPI, IMPS, RuPay cards, AePS, NETC FASTag, and the BHIM app.",
      "NPCI writes the technical rulebook every UPI app must follow — from the upi:// deep-link standard to transaction limits and dispute timelines. When you see 'NPCI guidelines' cited in merchant documentation, it refers to this rulebook. Apps sometimes show a wrapper line such as “NPCI returned error”; the actual reason is a two-character code (U16, Z9, ZM) you can look up on the error resolver."
    ],
    faqs: [
      { question: "Is NPCI a government body?", answer: "It is a not-for-profit company under the RBI's umbrella rather than a government department, but it functions as the official retail-payments utility for India." },
      { question: "Where can I verify UPI rules myself?", answer: "Official circulars live at npci.org.in — worth checking when a tool or app claims limits or features." }
    ],
    related: [
      { href: "/upi-error-codes/", label: "NPCI UPI error code resolver" },
      { href: "/upi-limits/", label: "Bank-wise UPI limits checker" }
    ]
  },
  {
    slug: "bhim",
    term: "BHIM",
    full: "Bharat Interface for Money",
    hindi: "भीम ऐप",
    category: "UPI Basics",
    shortDef: "NPCI's own minimal UPI app, launched December 2016 as the reference implementation.",
    body: [
      "BHIM is the Government-backed UPI app built directly by NPCI, deliberately stripped of cashback offers, ads, and extra services. It exists so that every Indian has a clean, trustworthy path to UPI even if third-party apps feel bloated or untrustworthy.",
      "Functionally it does what PhonePe or GPay do: scan QRs, send/receive by VPA, pay bills. Many merchants keep BHIM installed purely as a neutral second app for verifying that their counter QR works across ecosystems."
    ],
    faqs: [
      { question: "Is BHIM safer than PhonePe or GPay?", answer: "All UPI apps operate under identical NPCI security rules. BHIM feels simpler because it does less; safety depends more on your own habits than the app choice." },
      { question: "Can my customers use any app to pay my QR?", answer: "Yes — UPI QRs are interoperable. A standee generated once works identically in every UPI app." }
    ],
    related: [
      { href: "/bhim-qr-generator/", label: "BHIM-compatible QR generator" },
      { href: "/blog/how-to-generate-bhim-upi-qr-code/", label: "How to generate a BHIM UPI QR" }
    ]
  },
  {
    slug: "collect-request",
    term: "Collect Request",
    full: "UPI Collect Request",
    hindi: "कलेक्ट रिक्वेस्ट",
    category: "UPI Basics",
    shortDef: "A 'request for money' pushed to a payer's app, which they approve with their UPI PIN.",
    body: [
      "Instead of sending money, a collect request asks for it: you enter the payer's VPA, an amount, and a remark; their app pings them for approval. Nothing moves until they tap Pay and enter their own PIN.",
      "This flow powers rent reminders and small-business billing — but it is also the backbone of UPI fraud. Fraudsters send fake 'refund' or 'cashback' approvals expecting you to enter your PIN. Remember the direction: entering your PIN means money LEAVES your account. Receiving money never requires a PIN."
    ],
    faqs: [
      { question: "Do collect requests expire?", answer: "Yes — typically within a few minutes to hours depending on the app, after which the request dies silently." },
      { question: "Someone asked for my UPI PIN to receive money — legit?", answer: "Absolutely not. PIN is only for sending. Walk away." }
    ],
    related: [
      { href: "/payment-reminder-generator/", label: "Draft polite payment reminders" },
      { href: "/blog/is-it-safe-to-scan-upi-qr-code/", label: "Is scanning a UPI QR safe?" }
    ]
  },
  {
    slug: "imps",
    term: "IMPS",
    full: "Immediate Payment Service",
    hindi: "इमीडिएट पेमेंट सर्विस",
    category: "Payment Methods",
    shortDef: "NPCI's instant account-to-account transfer service — the predecessor UPI built upon.",
    body: [
      "IMPS launched in 2010 and was India's first 24×7 instant transfer rail. It works with beneficiary account number + IFSC instead of a VPA, making it the fallback choice where UPI fails or for transfers above UPI per-transaction limits.",
      "IMPS currently allows up to ₹5 lakh per transaction. Unlike UPI, banks may charge a small fee (typically ₹2.50–₹25 by slab), and the payer needs the recipient's actual banking coordinates."
    ],
    faqs: [
      { question: "IMPS vs UPI — which should I use?", answer: "For everyday collections, UPI is free and simpler. Use IMPS when transferring directly between accounts, above UPI limits, or when a recipient cannot accept UPI." },
      { question: "Are IMPS transfers instant?", answer: "Yes, credit is immediate and confirmations arrive via SMS from your bank." }
    ],
    related: [
      { href: "/upi-limits/", label: "Compare UPI vs IMPS daily limits" },
      { href: "/glossary/ifsc-code/", label: "What is an IFSC code?" }
    ]
  },
  {
    slug: "neft",
    term: "NEFT",
    full: "National Electronic Funds Transfer",
    hindi: "नेशनल इलेक्ट्रॉनिक फंड्स ट्रांसफर",
    category: "Payment Methods",
    shortDef: "RBI's batch-settled transfer system — near-instant these days, but settles in half-hourly cycles.",
    body: [
      "NEFT collects transfer instructions and settles them in half-hourly batches run by RBI around the clock since December 2019. In practice most NEFT transfers arrive within minutes, but they are not guaranteed-instant like UPI or IMPS.",
      "There is no minimum amount, and RBI has directed banks not to charge for online NEFT transactions. Businesses still use NEFT for vendor payouts and salary batches because it handles bulk files gracefully and leaves a clean banking trail."
    ],
    faqs: [
      { question: "Why would anyone still use NEFT over UPI?", answer: "Bulk payroll files, very large amounts beyond UPI caps, and accounting systems keyed to account numbers rather than VPAs." },
      { question: "Does NEFT work on Sundays?", answer: "Yes — the system runs 24×7 including holidays, though beneficiary bank processing may occasionally lag." }
    ],
    related: [
      { href: "/glossary/rtgs/", label: "RTGS — the large-value cousin" },
      { href: "/glossary/ifsc-code/", label: "IFSC codes explained" }
    ]
  },
  {
    slug: "rtgs",
    term: "RTGS",
    full: "Real Time Gross Settlement",
    hindi: "रियल टाइम ग्रॉस सेटलमेंट",
    category: "Payment Methods",
    shortDef: "RBI's large-value instant settlement system with a ₹2 lakh minimum — the heavyweight rail.",
    body: [
      "RTGS settles each instruction individually and immediately in RBI's books — 'gross' meaning no netting against other transfers. It is reserved for serious money: the minimum ticket is ₹2 lakh with no upper limit.",
      "Available 24×7 since December 2020, RTGS is what businesses use for property deals, high-value supplier payments, and statutory deposits where certainty and finality matter more than convenience. There is no VPA here — you need exact account number and IFSC."
    ],
    faqs: [
      { question: "Is there a maximum RTGS amount?", answer: "No upper limit — the ₹2 lakh minimum is the only size constraint." },
      { question: "Can RTGS fail or reverse?", answer: "Transfers are final. If details are wrong, recovery depends on the receiving bank's goodwill, so triple-check account numbers." }
    ],
    related: [
      { href: "/glossary/neft/", label: "NEFT explained" },
      { href: "/glossary/ifsc-code/", label: "IFSC codes explained" }
    ]
  },
  {
    slug: "ifsc-code",
    term: "IFSC Code",
    full: "Indian Financial System Code",
    hindi: "आईएफएससी कोड",
    category: "Payment Methods",
    shortDef: "An 11-character code identifying a specific bank branch — required for account-based transfers.",
    body: [
      "Format example: HDFC0000123. The first four letters name the bank, the fifth is always zero (reserved), and the last six digits pinpoint the branch. Every bank branch in India has exactly one IFSC.",
      "You will find it printed on cheque leaves, passbooks, and your bank's website. IFSC is mandatory wherever money moves by account number — NEFT, RTGS, IMPS, and salary-file uploads — while UPI conveniently hides it behind VPAs."
    ],
    faqs: [
      { question: "IFSC changed after my branch merged — what now?", answer: "Merged branches get remapped codes. Banks usually auto-update, but standing instructions referencing old IFSCs can fail; re-register payees with the new code." },
      { question: "Where is the official IFSC list?", answer: "RBI publishes the master database — beware of outdated third-party directories." }
    ],
    related: [
      { href: "/glossary/imps/", label: "IMPS uses IFSC — how it works" },
      { href: "/tools/", label: "All merchant tools" }
    ]
  },
  {
    slug: "static-upi-qr",
    term: "Static UPI QR",
    full: "Static UPI QR Code",
    hindi: "स्टैटिक UPI क्यूआर",
    category: "Merchant & QR",
    shortDef: "A permanent QR encoding just your VPA — customer enters the amount themselves.",
    body: [
      "Static QRs are the classic counter standee: print once, stick forever. Because no amount is embedded, every customer types their own bill value, making them perfect for variable-ticket businesses like kirana stores, salons, and donation boxes.",
      "Trade-offs: reconciliation is manual (you match payments yourself) and typo-driven wrong amounts happen. Pair the QR with your UPI ID printed below it, verify it scans before laminating, and check periodically that nobody has tampered with it."
    ],
    faqs: [
      { question: "Does a static QR expire?", answer: "No — it encodes only your VPA, so it keeps working until you change banks/VPAs." },
      { question: "Can I lock an amount on a static QR?", answer: "Not by definition — amount-locked codes are dynamic QRs, usually printed per invoice." }
    ],
    related: [
      { href: "/", label: "Free static QR standee generator" },
      { href: "/qr-sticker-generator/", label: "A4 sticker sheet printing" }
    ]
  },
  {
    slug: "dynamic-upi-qr",
    term: "Dynamic UPI QR",
    full: "Dynamic UPI QR Code",
    hindi: "डायनामिक UPI क्यूआर",
    category: "Merchant & QR",
    shortDef: "A per-transaction QR with the amount pre-filled and locked inside the payload.",
    body: [
      "Dynamic QRs append am (amount) and tn (note/reference) parameters to the standard upi:// payload. Scanning opens the payment screen with everything pre-filled — the customer just enters their PIN, eliminating typing errors entirely.",
      "They shine wherever exactness matters: invoice PDFs, order screens, event tickets, delivery COD collection. Because the note can carry an order ID, matching payments to orders becomes automatic instead of archaeology."
    ],
    faqs: [
      { question: "Do dynamic QRs need a paid gateway?", answer: "No — the format is plain NPCI standard. Tools like our invoice generator embed them free; gateways only add hosted pages and webhooks." },
      { question: "Can a customer change the amount?", answer: "The amount field arrives locked; only the paying app's own review screen governs edits, and standard UPI apps do not allow editing locked values." }
    ],
    related: [
      { href: "/invoice-generator/", label: "Invoices with embedded payment QR" },
      { href: "/blog/how-to-generate-upi-qr-with-amount/", label: "Amount-QR walkthrough" }
    ]
  },
  {
    slug: "soundbox",
    term: "Soundbox",
    full: "UPI Soundbox Device",
    hindi: "साउंडबॉक्स",
    category: "Merchant & QR",
    shortDef: "A speaker device that announces every received UPI payment aloud, defeating fake-screen fraud.",
    body: [
      "Soundboxes listen to your PSP's payment stream and announce 'received ₹X' within seconds of credit. During rush hours, the audio confirmation frees you from checking your phone after every sale — and instantly exposes customers showing fake payment screenshots.",
      "Providers (Paytm, PhonePe, GPay/Banks) bundle soundboxes with merchant accounts, sometimes free against monthly volume commitments or rented cheaply. They pair alongside — not instead of — your printed QR standee."
    ],
    faqs: [
      { question: "Do soundboxes need internet?", answer: "Yes — they connect via SIM/Wi-Fi. If connectivity drops, announcements pause while payments continue normally." },
      { question: "Is a soundbox compulsory for merchants?", answer: "Never. It is a convenience layer; your QR works perfectly without one." }
    ],
    related: [
      { href: "/blog/how-upi-soundboxes-work-and-their-safety/", label: "How soundboxes work & their safety" },
      { href: "/blog/setup-soundbox-announcements-for-shop-free/", label: "Free soundbox announcement guide" }
    ]
  },
  {
    slug: "mdr",
    term: "MDR",
    full: "Merchant Discount Rate",
    hindi: "मर्चेंट डिस्काउंट रेट",
    category: "Merchant & QR",
    shortDef: "The percentage a payment provider deducts from each sale — zero for standard bank-to-bank UPI, applies to credit-card-on-UPI above ₹2,000.",
    body: [
      "MDR is the fee slice taken from a merchant on every card or digital transaction. Card networks and banks typically charge 1–3%, which quietly erodes margins on thin-margin retail.",
      "Since January 2020, bank-to-bank UPI and RuPay debit carry zero MDR by government mandate — the structural reason Indian merchants push customers toward QR payments. RuPay credit card on UPI transactions above ₹2,000 are subject to interchange fees (typically 0.9–2% per NPCI circulars), but for ordinary bank-funded P2M UPI you keep 100% of the sale."
    ],
    faqs: [
      { question: "So accepting UPI really costs me nothing?", answer: "Directly, yes for bank-to-bank UPI. RuPay credit card on UPI transactions above ₹2,000 may carry interchange — rare for kirana-level commerce. Indirect costs are hardware like soundboxes or optional subscription services — never a cut of the payment itself for standard UPI." },
      { question: "How much am I losing on card sales?", answer: "Run your monthly card volume through our savings calculator to see the annual difference versus UPI." }
    ],
    related: [
      { href: "/upi-calculator/", label: "Calculate your UPI vs card savings" },
      { href: "/glossary/p2p-payment/", label: "P2P vs P2M payment types" }
    ]
  },
  {
    slug: "psp",
    term: "PSP",
    full: "Payment Service Provider",
    hindi: "पेमेंट सर्विस प्रोवाइडर",
    category: "Merchant & QR",
    shortDef: "The bank or entity whose @handle issued your VPA and routes your UPI payments.",
    body: [
      "Every UPI ID ends with a PSP handle: @okaxis (Axis Bank), @ybl (Yes Bank — the engine behind PhonePe), @ibl (ICICI), @paytm (Paytm Payments Bank). The PSP connects your VPA to the account you linked and guarantees delivery of instructions into the banking system.",
      "Third-party apps like PhonePe and Google Pay operate as TPAPs — they build the experience while a partner bank plays PSP. This is why switching phones never changes your VPA, but closing the underlying bank account does."
    ],
    faqs: [
      { question: "My PSP bank had issues — are my payments stuck?", answer: "Outages affect only that handle temporarily; other apps/handles keep working, another argument for keeping two UPI apps installed." },
      { question: "Does the PSP hold my money?", answer: "No — funds move account-to-account through NPCI rails; PSPs merely address and route them." }
    ],
    related: [
      { href: "/glossary/vpa/", label: "VPAs explained" },
      { href: "/glossary/npci/", label: "Who is NPCI?" }
    ]
  },
  {
    slug: "p2p-payment",
    term: "P2P vs P2M",
    full: "Person-to-Person vs Person-to-Merchant",
    hindi: "P2P और P2M भुगतान",
    category: "Merchant & QR",
    shortDef: "Two UPI flows: casual transfers between people (P2P) versus structured payments to registered merchants (P2M).",
    body: [
      "When you split a dinner bill with a friend, that is P2P. When you scan a shop's QR and the shop is registered as a merchant, that is P2M — routed with merchant metadata that enables zero-MDR treatment, dispute frameworks, and future credit products.",
      "For a small business the distinction matters for credibility and accounting: registering as a merchant (even free tiers) marks your inflows as business revenue cleanly rather than mixing them with personal transfers."
    ],
    faqs: [
      { question: "Do I need merchant registration to accept payments?", answer: "Technically no — customers can pay any VPA. Registering unlocks P2M rails, better limits, and cleaner books though." },
      { question: "Are P2M payments slower or costlier?", answer: "Neither — same speed, zero MDR on standard UPI." }
    ],
    related: [
      { href: "/glossary/mdr/", label: "MDR — the fee that isn't there" },
      { href: "/split-bill-calculator/", label: "Split bills with per-person UPI links" }
    ]
  },
  {
    slug: "tax-invoice",
    term: "Tax Invoice",
    full: "GST Tax Invoice",
    hindi: "टैक्स इनवॉइस",
    category: "Billing & GST",
    shortDef: "The mandatory GST document a registered supplier issues to charge tax on a taxable supply.",
    body: [
      "Under CGST law a tax invoice must show supplier and recipient GSTINs, a consecutive serial number, date, description/quantity/value, tax rate and amount, place of supply, and signature. It is the document on which input tax credit claims ride, so missing fields hurt your buyer, not just you.",
      "Goods generally require the invoice before or at removal/delivery; services allow issuance within 30 days of supply (45 for banks/NBFCs). Numbering must be sequential across the financial year with no gaps."
    ],
    faqs: [
      { question: "I'm not GST-registered — can I issue tax invoices?", answer: "No. Unregistered sellers issue a regular bill of supply without charging GST." },
      { question: "Inter-state vs intra-state invoices?", answer: "Same document; inter-state shows IGST, intra-state splits into CGST + SGST." }
    ],
    related: [
      { href: "/invoice-generator/", label: "Generate tax invoices with country templates" },
      { href: "/credit-note-generator/", label: "Need to correct one? Credit notes" }
    ]
  },
  {
    slug: "credit-note",
    term: "Credit Note",
    full: "GST Credit Note",
    hindi: "क्रेडिट नोट",
    category: "Billing & GST",
    shortDef: "A Section 34 document reducing a previously issued tax invoice after returns, discounts, or corrections.",
    body: [
      "Once a tax invoice exists, you cannot simply edit it. Sales returns, post-supply discounts, rate corrections, or cancelled orders require a credit note referencing the original invoice number and date, stating the reduced taxable value and tax.",
      "Both parties then adjust their returns — your GSTR-1 shows lower output tax while the buyer trims input credit. The issue deadline is 30 November following the financial year of the supply or the annual-return date, whichever is earlier."
    ],
    faqs: [
      { question: "Credit note vs debit note direction?", answer: "Credit note reduces what the buyer owes you; a debit note (issued by the buyer-side context or supplier for increases) documents more tax being payable." },
      { question: "Can I issue one months after the sale?", answer: "Yes, within the statutory window — the reference fields keep it tied to the original invoice." }
    ],
    related: [
      { href: "/credit-note-generator/", label: "Generate a compliant credit note" },
      { href: "/blog/quotation-vs-estimate-vs-invoice-vs-receipt/", label: "Which document when — guide" }
    ]
  },
  {
    slug: "debit-note",
    term: "Debit Note",
    full: "GST Debit Note",
    hindi: "डेबिट नोट",
    category: "Billing & GST",
    shortDef: "The mirror of a credit note — a supplementary document increasing tax payable on an earlier invoice.",
    body: [
      "If the original invoice understated value or tax — a missed line item, a rate applied too low — a debit note formally raises the amount. It references the same original invoice fields a credit note does and flows into returns the same way.",
      "Buyers issue debit notes too, commonly against purchase orders or defective supplies received, signalling a claim. Context defines direction: supplier-issued debit notes increase output tax; buyer-issued ones record demands against suppliers."
    ],
    faqs: [
      { question: "Numbering rules for debit notes?", answer: "Consecutive serial numbers in their own series work — many firms use DN-YYYY-#### alongside the invoice series." },
      { question: "Time limit like credit notes?", answer: "The same Section 34 window applies to tax-reducing documents; upward revisions should follow promptly to stay aligned with returns." }
    ],
    related: [
      { href: "/glossary/credit-note/", label: "Credit note — the mirror document" },
      { href: "/invoice-generator/", label: "Keep your invoice data clean at source" }
    ]
  },
  {
    slug: "proforma-invoice",
    term: "Proforma Invoice",
    full: "Proforma Invoice",
    hindi: "प्रोफॉर्मा इनवॉइस",
    category: "Billing & GST",
    shortDef: "A preliminary 'this is what we'd bill' document — not a tax invoice, not payable.",
    body: [
      "Proforma invoices quote scope, prices, and terms in invoice format before supply happens. Import/export customs processes, advance-payment requests, and corporate procurement workflows lean on them because they look authoritative while remaining non-tax documents.",
      "Key distinctions: no GSTIN-charged tax columns apply yet, no serial-number obligation under GST, and it converts into a real tax invoice upon confirmation. Marking it clearly 'PROFORMA INVOICE' prevents accounting mix-ups downstream."
    ],
    faqs: [
      { question: "Can a customer pay against a proforma invoice?", answer: "Commonly yes, especially advances — but issue the proper tax invoice for that payment, or a proforma-marked receipt, to keep records straight." },
      { question: "Proforma vs quotation?", answer: "Near-synonyms; proformas mimic invoice layout for formal workflows while quotations read like offers." }
    ],
    related: [
      { href: "/quotation-generator/", label: "Quotation generator with validity dates" },
      { href: "/invoice-generator/", label: "Convert to a real invoice" }
    ]
  },
  {
    slug: "gstin",
    term: "GSTIN",
    full: "GST Identification Number",
    hindi: "जीएसटीआईएन",
    category: "Billing & GST",
    shortDef: "The 15-character GST registration number every taxable supplier prints on invoices.",
    body: [
      "Structure: two digits of state code, ten characters of PAN, an entity code, the letter Z (default), and a checksum letter — e.g., 29ABCDE1234F1Z5 for a Karnataka entity. B2B buyers need your GSTIN to claim input credit; wrong GSTIN = their credit bounces.",
      "Registration becomes compulsory once aggregate turnover crosses threshold limits (₹40 lakh goods / ₹20 lakh services, lower in special-category states), though voluntary registration is common for input-credit benefits."
    ],
    faqs: [
      { question: "How can customers validate my GSTIN?", answer: "The GST portal's search-by-GSTIN tool confirms legal name and status — sensible due diligence before first large orders." },
      { question: "One GSTIN for all India?", answer: "Each state of operation gets its own GSTIN under the same PAN." }
    ],
    related: [
      { href: "/gst-calculator/", label: "GST amount calculator with QR" },
      { href: "/invoice-generator/", label: "Invoices that print your GSTIN correctly" }
    ]
  },
  {
    slug: "revenue-stamp",
    term: "Revenue Stamp",
    full: "Fiscal Revenue Stamp",
    hindi: "रेवेन्यू स्टैम्प",
    category: "Billing & GST",
    shortDef: "The ₹1 stamp affixed and signed on certain paper acknowledgements — famously required on cash rent receipts of ₹5,000+.",
    body: [
      "Indian stamp law expects a revenue stamp on receipts for cash payments of ₹5,000 or more, signed by (or for) the payee. The physical stamp converts paper into stamped evidence; digital transfers sidestep the requirement because the bank trail itself proves payment.",
      "Practical workflow: buy sheets of stamps from stationers or post offices, affix one inside the dedicated box, sign across it partially. HRA submissions and landlord records are where tenants encounter this relic most often."
    ],
    faqs: [
      { question: "Needed if rent goes via UPI?", answer: "Generally no — print the mode and UTR reference on the receipt instead; the electronic trail substitutes." },
      { question: "Where do I buy revenue stamps?", answer: "Post offices, court-stationery shops, and many general stores stock ₹1 denomination sheets." }
    ],
    related: [
      { href: "/rent-receipt-generator/", label: "Rent receipts with stamp box included" },
      { href: "/hi/blog/rent-receipt-format-hra-exemption-india/", label: "HRA rent receipt guide (Hindi)" }
    ]
  },
  {
    slug: "pos-machine",
    term: "POS Machine",
    full: "Point-of-Sale Terminal",
    hindi: "पीओएस मशीन",
    category: "Merchant & QR",
    shortDef: "The card-swipe terminal at counters — increasingly redundant next to a zero-fee UPI QR.",
    body: [
      "POS terminals accept card-present payments, charging MDR of roughly 1–3% plus rental or purchase costs and settlement delays of a day or two. For micro-merchants the math rarely works against a free QR that settles instantly into the bank account.",
      "Modern POS devices increasingly double as UPI+soundbox combos, blurring categories. The decision rule stays constant: if your volume is mostly UPI-paying walk-ins, a printed standee covers 90% of needs at zero cost."
    ],
    faqs: [
      { question: "Can I refuse cards and take only UPI?", answer: "Legal tender rules permit cash refusal nuances aside, most merchants simply prefer UPI economics — displaying both options maximises conversions." },
      { question: "POS settlement time vs UPI?", answer: "UPI credits instantly; POS batches settle T+1 typically." }
    ],
    related: [
      { href: "/blog/how-to-accept-upi-payments-without-pos-machine/", label: "Accepting UPI without a POS machine" },
      { href: "/upi-calculator/", label: "Quantify POS fees vs free UPI" }
    ]
  },
  {
    slug: "upi-lite",
    term: "UPI Lite",
    full: "UPI Lite Small-Value Payments",
    hindi: "यूपीआई लाइट",
    category: "Payment Methods",
    shortDef: "NPCI's on-device wallet for tiny payments — no PIN needed, works even when networks wobble.",
    body: [
      "UPI Lite loads a small balance onto the phone itself; payments under the per-transaction cap (₹500 at launch-era rules, since revised upward) deduct from that local wallet without hitting the core banking system or requiring a PIN.",
      "Designed for vegetables-at-the-cart speed and patchy connectivity, Lite debits your main account only when you top up the wallet. Balance and load limits evolve with RBI circulars, so check your app's current caps."
    ],
    faqs: [
      { question: "Is UPI Lite a separate wallet company?", answer: "No — it is a UPI feature processed on-device, backed by your own bank account, not prepaid vouchers." },
      { question: "Can merchants tell it apart?", answer: "Payments arrive identically; only the payer notices the lighter flow." }
    ],
    related: [
      { href: "/upi-limits/", label: "Current UPI limit landscape" },
      { href: "/blog/upi-lite-vs-upi-pay-small-transactions/", label: "Lite vs standard UPI comparison" }
    ]
  },
  {
    slug: "upi-autopay",
    term: "UPI AutoPay",
    full: "UPI AutoPay / e-Mandate",
    hindi: "यूपीआई ऑटोपे",
    category: "Payment Methods",
    shortDef: "Recurring UPI mandates that pull subscription payments automatically within approved limits.",
    body: [
      "AutoPay registers a mandate — who, how much, how often — authorised once with your UPI PIN. Thereafter the merchant pulls each cycle automatically: OTTs, gym memberships, mutual-fund SIPs, loan EMIs, insurance premiums.",
      "Small mandates (originally up to ₹15,000) execute without re-authentication; higher-value categories like credit-card bills and investments enjoy raised thresholds under later NPCI/RBI updates. Customers control everything from a manage-mandates screen and can pause or revoke anytime."
    ],
    faqs: [
      { question: "AutoPay vs standing instruction on cards?", answer: "Same concept on UPI rails — useful precisely because your customers' UPI penetration dwarfs card penetration." },
      { question: "Do failed AutoPay debits retry?", answer: "Per NPCI rules retries occur within the cycle; merchants notify before deactivating services." }
    ],
    related: [
      { href: "/blog/upi-autopay-mandate-qr-recurring-payments/", label: "Recurring payments deep-dive" },
      { href: "/payment-reminder-generator/", label: "Remind customers before renewals" }
    ]
  },
  {
    slug: "rupay-credit-card-upi",
    term: "RuPay Credit Card on UPI",
    full: "RuPay Credit Card linkage with UPI",
    hindi: "रुपे क्रेडिट कार्ड और UPI",
    category: "Payment Methods",
    shortDef: "Link a RuPay credit card to a UPI app and spend credit at QR-scanning stalls, not just POS terminals.",
    body: [
      "Traditionally credit cards needed POS machines. Linking RuPay credit cards to UPI brought credit spending to the vegetable vendor: select the card inside the UPI app before scanning, and the payment rides your credit line.",
      "Economics: customers pay nothing extra, but merchants see an interchange (around 1.1% on transactions above ₹2,000, subject to periodic NPCI revision) netted on the acquiring side — the one mainstream case where small-ticket UPI stops being strictly zero-cost for the seller."
    ],
    faqs: [
      { question: "Can any credit card link to UPI?", answer: "Currently only RuPay-network credit cards support it; Visa/Mastercard variants remain POS-only." },
      { question: "Do reward points apply on UPI spends?", answer: "Issuer-dependent — several banks extend rewards, some exclude certain merchant categories." }
    ],
    related: [
      { href: "/blog/how-to-link-credit-card-to-upi-qr/", label: "Linking walkthrough" },
      { href: "/blog/rupay-credit-card-upi-mdr-charges/", label: "Interchange & MDR details" }
    ]
  }
];

export const GLOSSARY_SLUGS = GLOSSARY_TERMS.map((t) => `glossary/${t.slug}`);

export function getGlossaryTerm(slug: string): GlossaryTerm | undefined {
  return GLOSSARY_TERMS.find((t) => t.slug === slug);
}
