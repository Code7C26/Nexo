/**
 * core/manual-en.js
 * El manual de uso en inglés (Configuración → Apariencia → Idioma). Cada
 * sección va por el mismo id que en core/manual.js, que lo toma de acá
 * cuando la interfaz está en inglés: título, nombre de la pantalla, preguntas
 * y palabras para la búsqueda, y el texto. El hash de la pantalla, el módulo,
 * admin y las relacionadas salen del manual en castellano.
 *
 * Una sección nueva del manual se escribe también acá. Sin su versión, se
 * muestra en castellano.
 */

export const GRUPOS_EN = {
  Empezar: "Getting started",
  "Productos y servicios": "Products and services",
  Vender: "Selling",
  "Vender por internet": "Selling online",
  Facturar: "Invoicing",
  Clientes: "Customers",
  "Comprar y stock": "Purchasing and stock",
  Plata: "Money",
  "Servicios y gimnasio": "Services and gym",
  "Tu cuenta y tu equipo": "Your account and your team"
};

export const SECCIONES_EN = {
  empezar: {
    titulo: "How Nexo is organized",
    preguntas: ["how do i use nexo", "where do i start", "what does nexo do", "how does the system work", "where is everything"],
    palabras: ["menu", "start", "organized", "sections", "overview"],
    bloques: [
      "Nexo brings together everything that happens in your business: what you sell, what you buy, stock, money and your customers. Everything you enter updates the rest on its own: a sale deducts stock, adds what the customer owes you and goes into the cash when you collect it.",
      { lista: [
        "**The menu on the left** (on your phone, the bottom bar and \"More\") has every screen, grouped: products and customers, sales, purchases, stock and money.",
        "**Dashboard** shows how the business is doing: what you sold, what you made and what you spent in the period.",
        "**The assistant** (the sparkle button) records sales, purchases and expenses when you tell it, and answers questions like this one.",
        "**Settings** has the business details, the features you use, your team and this help."
      ] },
      "If you're just starting, on the Dashboard you'll see a getting-started guide: add a product, a customer and your first sale. If your business was already running, first enter what you already had: today's stock, debts and money."
    ]
  },
  asistente: {
    titulo: "The assistant: record things by telling it",
    pantalla: "Assistant",
    preguntas: ["how do i use the assistant", "can i record a sale by talking", "how do i dictate", "what is the assistant for", "can i speak to it", "how do i record by voice"],
    palabras: ["assistant", "ai", "voice", "dictate", "microphone", "speak", "audio", "chat"],
    bloques: [
      "The assistant understands sentences like the ones you'd say to someone: \"I sold 3 t-shirts to Juan for 45 thousand and he paid with Mercado Pago\", \"I bought 10 pants from Textil Norte at 9 thousand each\", \"I paid 25 thousand for electricity in cash\" or \"Juan returned the t-shirt, it was too small\".",
      { pasos: [
        "Open the assistant with the sparkle button, or from **Assistant** in the menu.",
        "Type what happened, or tap the **microphone**, say it and tap it again to finish.",
        "It shows you how it understood it: the customer, the products, the quantities, the prices and the payment. Correct whatever is needed.",
        "Tap **Confirm and record**. Nothing is recorded until then."
      ] },
      "You can also ask it how to do something in Nexo (\"how do I void a sale?\") and it answers with this manual.",
      "And about your business's numbers: \"how much did I sell this month?\", \"how much did I sell in t-shirts last week?\", \"who owes me?\", \"how many caps do I have left?\". It answers right away, with the same numbers as the Summary and without recording anything.",
      { nota: "So it understands you better, name the products the way they're entered. If a product doesn't exist, the sale can't be confirmed until you fix it; in a purchase, the new product is created automatically." },
      { nota: "Recording sales, purchases and expenses with the assistant is part of the Pro plan." }
    ]
  },
  celular: {
    titulo: "Using Nexo on your phone",
    pantalla: "Settings › Appearance",
    preguntas: ["how do i install nexo on my phone", "is there a phone app", "does it work without internet", "how do i put it on the home screen", "switch to dark mode", "change the language"],
    palabras: ["phone", "mobile", "app", "install", "android", "iphone", "offline", "internet", "theme", "dark", "light", "language", "english"],
    bloques: [
      "Nexo works in your phone's browser and can be installed as an app, with its icon on the home screen. You don't need to download anything from a store.",
      { pasos: [
        "Open Nexo in your phone's browser.",
        "Go to **Settings › Appearance** and tap **Install Nexo**. On iPhone: Safari's share button and \"Add to Home Screen\".",
        "From there you also choose the light or dark theme, and the language."
      ] },
      "Without a connection, Nexo opens and shows the latest data it loaded, with a notice at the top. To enter something new you need internet."
    ]
  },
  "cargar-producto": {
    titulo: "Adding a product or a service",
    pantalla: "Products",
    preguntas: ["how do i add a product", "how do i add an item", "how do i add a service", "how do i change a product price", "how do i sell by the kilo", "where do i enter the cost"],
    palabras: ["product", "item", "service", "add", "price", "cost", "sku", "code", "barcode", "kilo", "kg", "unit", "measure", "catalog", "edit"],
    bloques: [
      { pasos: [
        "Go to **Products** (it may be called Services, depending on your business) and tap **New product**.",
        "Enter the name, the sale price and, if you know it, the cost. The price is the final one, VAT included.",
        "Choose the unit: per unit, or by kilo, gram, liter or meter if you sell it in fractions.",
        "If it's a service (a haircut, a class, an hour of work), choose the service type: it doesn't track stock.",
        "Tap **Save**."
      ] },
      "To change a price, open the product from the list and edit it. The code or SKU is for finding it quickly; the **Barcode** is the one the counter scanner reads, and the **Scale code (PLU)** is for what you weigh on a scale that prints labels.",
      { nota: "The cost updates on its own every time you record a purchase: Nexo averages what you had and what came in. What didn't come from a purchase (what you brought from Tienda Nube without a cost, for example) is entered in **Edit**, under **Cost of each**; with sizes or colors, each variant's cost goes in **Variants**." }
    ]
  },
  variantes: {
    titulo: "Sizes, colors and variants",
    pantalla: "Products",
    preguntas: ["how do i add sizes", "how do i add colors", "a product with several sizes", "how do i make variants"],
    palabras: ["size", "sizes", "color", "colors", "variant", "variants", "attribute", "model"],
    bloques: [
      "If you sell the same product in several sizes or colors, add it once and set up its variants: each combination has its own stock and code.",
      { pasos: [
        "Open the product and tap **Variants**.",
        "Tap **Add attribute** (for example, Size) and add its values (S, M, L). Repeat with Color if needed.",
        "Tap **Generate variants**: Nexo creates every combination."
      ] },
      "When selling, you choose the exact variant (Black t-shirt M)."
    ]
  },
  "listas-precios": {
    titulo: "Price lists (retail, wholesale…)",
    pantalla: "Settings › Price lists",
    preguntas: ["how do i set a wholesale price", "can i have two prices", "how do i make a price list", "card price"],
    palabras: ["list", "lists", "wholesale", "retail", "card", "prices", "price"],
    bloques: [
      "The same product can have a different price depending on who you sell to: retail, wholesale, by card.",
      { pasos: [
        "In **Products**, tap **Price lists** and add the ones you use.",
        "On each product, enter its price on each list.",
        "When making a sale or a quote, choose the list: the prices come from there."
      ] }
    ]
  },
  categorias: {
    titulo: "Product categories",
    pantalla: "Settings › Categories",
    preguntas: ["how do i group products", "how do i create a category", "how do i organize the catalog"],
    palabras: ["category", "categories", "group", "family", "organize"],
    bloques: [
      "Categories group your products (drinks, groceries, t-shirts) and help filter the list and see on the Dashboard what sells in each one.",
      "They're set up in **Products › Categories**, and on each product you choose its own."
    ]
  },
  "punto-de-venta": {
    titulo: "Selling at the counter (Point of sale)",
    pantalla: "Point of sale",
    preguntas: ["how do i sell at the counter", "how do i open the register", "how do i close the register", "how do i charge with the scanner", "how do i count the cash", "how do i give change", "how do i charge with two payment methods", "how do i issue an invoice a at the counter"],
    palabras: ["counter", "point", "pos", "register", "cash", "shift", "open", "close", "count", "change", "scanner", "scan", "barcode", "charge", "quick"],
    bloques: [
      "It's the screen for selling fast, standing in front of the customer.",
      { pasos: [
        "At the start of the day, tap **Open register** and count the cash you start with.",
        "Search for each product by name or code, or scan it (your phone's camera works too).",
        "Tap **Charge** and choose how they pay: cash, transfer, card… They can pay with more than one. If it's cash, Nexo calculates the change.",
        "Right there, choose **No invoice** or the invoice that applies (**Invoice A** or **Invoice B** if you're a registered VAT taxpayer, **Invoice C** if not), and tick **Print the receipt** if you want it to come out on its own. It stays as you left it for the next sale.",
        "At the end of the day, tap **Close register** and count the cash: Nexo tells you if it matches what there should be."
      ] },
      "Without choosing a customer, the sale goes to End consumer. To leave something on account for someone, choose the customer: End consumer can't buy on credit.",
      { lista: [
        "**The payment methods** you see when charging (cash, debit, credit with its installments, transfer…) are set up by the admin in Settings › Payment methods.",
        "**Discount**: a percentage or an amount off the whole sale, without creating a promotion. Current promotions apply on their own.",
        "**Charge with a Mercado Pago QR**: with your Mercado Pago connected, the customer scans and the payment comes in when they pay.",
        "**Scale**: if your scale prints labels, scan the label and the product comes in with its weight."
      ] },
      "To issue invoice A to a company or a monotributo taxpayer, tap **Invoice A** and confirm their CUIT, their name and their VAT status. If they're already in your customers, Nexo finds them by the CUIT; if not, it creates them. If you issue invoice C, the **Invoice a customer with a CUIT** link does the same. The letter comes from your VAT status and the customer's: a registered taxpayer can't get a B.",
      "The receipt is for 80 mm printers. Print it again from the sale's page, with **Ticket**.",
      { nota: "If you don't see Point of sale in the menu, turn it on in Settings › Features." }
    ]
  },
  "registrar-venta": {
    titulo: "Recording a sale",
    pantalla: "Sales",
    preguntas: ["how do i record a sale", "how do i enter a sale", "how do i sell", "how do i sell on account", "how do i sell to a customer", "how do i sell on credit"],
    palabras: ["sale", "sales", "sell", "record", "enter", "new", "credit", "account"],
    bloques: [
      { pasos: [
        "Go to **Sales** and tap **New sale**.",
        "Choose the customer and the price list.",
        "Add the products with their quantity: the price comes from the list and you can change it.",
        "If they already paid you, enter the payment (how much and into which account). If not, it stays on account: they owe it.",
        "Tap **Record sale**."
      ] },
      "When it's recorded, Nexo deducts the stock, keeps the cost at that moment to calculate the profit and, if something was left uncollected, adds it to what the customer owes you. If you sell online, choose **Where they bought from** (the shop, Instagram, WhatsApp…).",
      "On the sale's page you see **Where the money went**: the goods, each sale expense (the fee, the shipping, the installments), the VAT and what you kept. If you paid for shipping, add it with **Add the shipping**.",
      "You can also record it from the assistant: \"I sold 2 hoodies to Sole at 28 thousand each, she paid cash\"."
    ]
  },
  "vender-en-cuotas": {
    titulo: "Selling in installments (without a card)",
    pantalla: "Products",
    preguntas: ["how do i sell in installments", "how do i set up a payment plan", "how do i collect in installments without a card", "how do i set an installment price", "one payment of 100 thousand or three of 50 thousand", "how do i finance a sale"],
    palabras: ["installments", "installment", "plan", "payments", "finance", "financing", "pay", "monthly", "account", "credit"],
    bloques: [
      "If you sell something in installments with your own financing (one payment of $100,000, two of $65,000 or three of $50,000), each product can have its plans. What's left to pay stays on the customer's account, one installment a month.",
      { pasos: [
        "In **Products**, edit the product and under **Price in installments** tap **Add a plan**: how many installments and how much each. Nexo shows the total and how much more it is than paying at once.",
        "When you sell it (in **Sales › New sale** or at the counter), choose how they pay: **1 payment** or one of the plans. The price is the plan's.",
        "Choose the customer: you can't sell in installments without one.",
        "Collect what they pay today: the counter suggests the first installment."
      ] },
      "The first installment is due on the day of the sale and the rest every month. On the sale's page you see each installment with its due date and what's left; in **Accounts**, each installment shows its number (installment 2 of 3) and only the ones already due count as overdue.",
      { nota: "A sale in installments can't be edited: if it needs changing, void it and enter it again. It doesn't take a manual discount: the price is the plan's." }
    ]
  },
  cobrar: {
    titulo: "Collecting a sale or a debt",
    pantalla: "Accounts",
    preguntas: ["how do i collect a sale", "how do i record a customer payment", "they paid what they owed", "how do i collect a debt", "how do i record a partial payment"],
    palabras: ["payment", "collect", "paid", "debt", "owes", "partial", "balance", "deposit"],
    bloques: [
      "A sale and its payment are different things: you can sell today and collect in parts.",
      { pasos: [
        "Open the sale (from **Sales** or from the customer's profile) and tap **Charge**.",
        "Enter how much they paid you and which account the money went into (cash, bank, Mercado Pago).",
        "Tap **Record payment**."
      ] },
      "The payment lowers what the customer owes and adds the money to that account in Cash.",
      "If they pay with Mercado Pago, in the same payment tap **Charge with QR** if they are with you (Mercado Pago charges a lower fee for the QR), or **Send a payment link** to send it over WhatsApp. It goes for the amount you entered, or for everything they owe. When they pay, the payment is recorded on its own."
    ]
  },
  "anular-venta": {
    titulo: "Voiding a sale",
    pantalla: "Sales",
    preguntas: ["how do i void a sale", "how do i delete a sale", "i made a mistake on a sale", "how do i cancel a sale", "how do i remove a sale"],
    palabras: ["void", "delete", "remove", "cancel", "mistake", "error", "undo"],
    bloques: [
      { pasos: [
        "Open the sale from **Sales**.",
        "Tap **Void** and confirm."
      ] },
      "When voided, the products go back to stock and the sale moves to the Trash, where it can be restored.",
      { nota: "A sale that already has payments, an invoice or a return can't be voided. If you already collected or invoiced it, what you need is a return (with its credit note)." }
    ]
  },
  "devolucion-venta": {
    titulo: "A customer return",
    pantalla: "Returns",
    preguntas: ["how do i make a return", "a customer returned something", "how do i exchange a product", "how do i make a credit note"],
    palabras: ["return", "returned", "exchange", "credit", "note", "refund"],
    bloques: [
      { pasos: [
        "Open the original sale from **Sales** and tap **Return**.",
        "Choose which products and how many they return.",
        "Tap **Record return**."
      ] },
      "The products go back to stock and it's deducted from the sale. If the sale was invoiced, from the return you tap **Issue credit note**: it has the same letter as the invoice and goes to the same customer, because it corrects it.",
      "All returns are kept in **Returns**.",
      "You can also tell the assistant: \"Juan returned the t-shirt, it was too small\". It finds the sale and shows you what's being returned before recording it."
    ]
  },
  presupuestos: {
    titulo: "Quotes",
    pantalla: "Quotes",
    preguntas: ["how do i make a quote", "how do i turn a quote into a sale", "how do i send a quote", "how do i print a quote"],
    palabras: ["quote", "quotes", "estimate", "convert", "accepted", "rejected", "expired"],
    bloques: [
      { pasos: [
        "Go to **Quotes** and tap **New quote**.",
        "Choose the customer, the date it's valid until and the products.",
        "Tap **Save quote**. From its profile you print it or save it as a PDF to send it."
      ] },
      "A quote doesn't touch stock. When the customer accepts, open it and tap **Convert into sale**: the sale is created with the same products and prices.",
      "If the date passes, it shows as expired. You can also mark it as accepted or rejected."
    ]
  },
  facturar: {
    titulo: "Making an invoice",
    pantalla: "Invoices",
    preguntas: ["how do i make an invoice", "how do i invoice a sale", "how do i print an invoice", "how do i get the invoice pdf", "which invoice letter do i use", "a or b invoice", "what do i need to issue an invoice a", "can i give a monotributo taxpayer invoice b", "why do i get invoice b"],
    palabras: ["invoice", "invoices", "receipt", "print", "pdf", "ticket", "letter"],
    bloques: [
      "You can invoice a sale you already recorded, or make a standalone invoice.",
      { pasos: [
        "For a sale: open it and tap **Invoice**. For a standalone one: **Invoices › New invoice**.",
        "If you're a registered VAT taxpayer, choose **Invoice A** or **Invoice B**: the A asks for the customer's CUIT and the B doesn't. Check their details and the sale terms.",
        "Tap **Generate invoice**. From its profile, **Print / PDF**."
      ] },
      "The letter is set automatically, based on your VAT status and the customer's, so you never issue one ARCA doesn't accept:",
      { lista: [
        "If you're a **registered VAT taxpayer** (responsable inscripto): A to another registered taxpayer or to a monotributo taxpayer, and B to an end consumer or an exempt one. A monotributo taxpayer doesn't get a B: since 2021 they get an A.",
        "If you're **monotributo or exempt**: always C."
      ] },
      "For an A, the customer needs their CUIT on file. If they don't give it to you, it isn't an A: it's a B to an end consumer. A registered taxpayer buying for themselves also gets a B: choose **Invoice B** and it goes out without their details, without changing their record.",
      "The A shows the VAT separately; the B says how much VAT the price contains, as the fiscal transparency law requires. An A to a monotributo taxpayer carries a note saying that VAT only counts for the monotributo regime.",
      "The invoice keeps the customer's details as they were at that moment: if you change their record later, the invoice doesn't change.",
      "At the Point of sale you choose the invoice when charging, without coming here: tapping **Invoice A** lets you enter the customer with their CUIT right there.",
      { nota: "Without electronic invoicing turned on, the receipt is internal: it comes out with an X and \"Not valid as an invoice\". To invoice with ARCA, see Electronic invoicing. Printed receipts are always in Spanish: they're Argentine tax documents." }
    ]
  },
  "factura-electronica": {
    titulo: "Electronic invoicing with ARCA",
    pantalla: "Settings › Electronic invoicing",
    preguntas: ["how do i turn on electronic invoicing", "how do i connect to arca", "how do i get the cae", "how do i invoice with afip", "what is the cae"],
    palabras: ["arca", "afip", "cae", "electronic", "tax", "delegation", "point", "sale", "cuit"],
    bloques: [
      "With electronic invoicing turned on, every invoice and credit note comes with its CAE, the number ARCA gives that makes it valid.",
      { pasos: [
        "Go to **Settings › Electronic invoicing**.",
        "Follow the steps to give Nexo permission from ARCA. Nexo never asks for your tax password.",
        "Enter your CUIT and your VAT status (**Enter the CUIT and the status**) and the point of sale, and tap **Verify with ARCA**.",
        "Done: when you make an invoice, Nexo requests the CAE from ARCA. If ARCA doesn't respond, it stays pending and is retried with **Request the CAE from ARCA**."
      ] },
      "ARCA gives each invoice its number, so none is skipped or repeated, even on a retry. Each one comes with the CAE, its expiry date and ARCA's QR code, which anyone can use to verify it.",
      "If ARCA rejects an invoice, Nexo shows you why: fix the detail (for example, the customer's CUIT) and request the CAE again, or discard it. A rejected invoice doesn't use up a number.",
      { nota: "Today it works in ARCA's test environment: receipts say \"Comprobante de prueba – sin validez fiscal\" (test receipt, no tax validity)." },
      { nota: "It starts with the Entrepreneur plan. If your business moves to Free, it's paused: turn it off to keep issuing internal receipts, or go back to a paid plan." }
    ]
  },
  iva: {
    titulo: "VAT",
    pantalla: "Settings › Receipts and tax details",
    preguntas: ["how do i enter vat", "where do i see vat", "does the price include vat", "i am vat registered", "i am a monotributista", "vat book"],
    palabras: ["vat", "tax", "rate", "registered", "monotributo", "exempt", "consumer", "status", "book", "credit"],
    bloques: [
      { lista: [
        "**Your status** (VAT registered, monotributo, exempt) goes in Settings › Receipts and tax details.",
        "**Each customer's and supplier's**, on their profile. Empty means end consumer.",
        "**Each product's rate** (21 %, 10.5 %…) goes on the product. The price you enter is the final one, VAT included."
      ] },
      "With that Nexo chooses each invoice's letter, itemizes the VAT on the A invoice and keeps it on each row.",
      "If you're VAT registered, the VAT on purchases with an A invoice is tax credit and doesn't add to the cost, and profit is calculated without VAT. On the **Dashboard** you see the VAT for the period and the sales and purchases VAT books."
    ]
  },
  clientes: {
    titulo: "Customers",
    pantalla: "Customers",
    preguntas: ["how do i add a customer", "how do i create a customer", "where do i see what a customer bought", "how do i set a credit limit"],
    palabras: ["customer", "customers", "client", "profile", "details", "contact", "limit", "credit", "terms", "payment"],
    bloques: [
      { pasos: [
        "Go to **Customers** (or CRM) and tap **New customer**.",
        "Enter the name and whatever you have: phone, email, CUIT, their VAT status and how many days they usually take to pay you.",
        "Tap **Save customer**."
      ] },
      "On each customer's profile you see everything they bought from you, what they owe you and their activity."
    ]
  },
  crm: {
    titulo: "Leads and follow-up (CRM)",
    pantalla: "CRM",
    preguntas: ["how do i note a lead", "how do i follow up with a customer", "what is the crm", "who do i have to call today", "which customers stopped buying", "how do i mark a lead as lost"],
    palabras: ["crm", "lead", "leads", "follow", "pipeline", "stage", "prospect", "interested", "call", "today", "stopped", "lost", "won", "task"],
    bloques: [
      "The CRM is for people who haven't bought from you yet: who asked, what they're looking for and when to write back.",
      { pasos: [
        "In **CRM**, tap **New lead** and note who they are and what they're interested in.",
        "Drag the card from stage to stage as it moves forward.",
        "With **Add follow-up** you set the next action (call them on Thursday) and Nexo reminds you in \"For today\".",
        "When they buy, turn it into a customer, a quote or a sale without entering anything again. If they don't buy, **Mark as lost** and choose why."
      ] },
      "In \"Stopped buying\" you see the customers who haven't come back in a while, so you can write to them."
    ]
  },
  "cuentas-corrientes": {
    titulo: "Who owes you and who you owe",
    pantalla: "Accounts",
    preguntas: ["who owes me", "how much am i owed", "who do i owe", "how do i see customer debts", "which invoices are due", "customer account"],
    palabras: ["account", "debt", "debts", "owes", "owe", "balance", "due", "overdue", "collect", "pay", "credit", "money"],
    bloques: [
      "In **Accounts** you have two lists: **Receivable** (what your customers owe you) and **Payable** (what you owe your suppliers), with what's overdue and what's coming due.",
      "The balance comes from the sales, purchases, payments received and payments made you recorded: it can't be edited by hand. To lower a debt, record the payment."
    ]
  },
  puntos: {
    titulo: "Points and rewards",
    pantalla: "Points and rewards",
    preguntas: ["how do i set up a points program", "how does a customer redeem points", "how do i give points to a customer", "how many points does a customer have", "how do i set up rewards", "how do i get customers to come back"],
    palabras: ["points", "point", "reward", "rewards", "redeem", "loyalty", "card", "gift", "earn", "come back"],
    bloques: [
      "Your customers earn points with what they pay and redeem them for rewards at the counter: a discount on the purchase or something free. First turn on **Points and rewards** in Settings → Features.",
      { pasos: [
        "In **Points and rewards**, enter how many pesos earn one point and, if you want, after how many months they expire. Tap **Save**.",
        "Tap **New reward**: a percentage off, an amount off or a free product, and how many points it costs.",
        "At the **Point of sale**, choose the customer: their points show up. Tap **Redeem a reward** and pick it before charging."
      ] },
      { lista: [
        "What the customer pays earns points: credit sales earn when they're paid, and \"Walk-in customer\" doesn't earn.",
        "If you change the rule, it applies to what you sell from then on: nobody gains or loses points all at once.",
        "If you void a sale, the points it gave are taken away and the ones redeemed in it come back. A return takes away the points of what was returned.",
        "Redeeming uses the points that expire first."
      ] },
      "Each customer's page shows their points and where they came from. There the admin adds or removes points by hand, with the reason (for example, the ones from their paper card), and anyone can tell them their points over WhatsApp. The messages are changed in Settings → WhatsApp messages."
    ]
  },
  "registrar-compra": {
    titulo: "Recording a purchase",
    pantalla: "Purchases",
    preguntas: ["how do i record a purchase", "how do i enter goods i bought", "how do i enter shipping on a purchase", "how do goods go into stock", "how do i update the cost"],
    palabras: ["purchase", "purchases", "bought", "goods", "supplier", "shipping", "freight", "received", "order", "cost", "restock"],
    bloques: [
      { pasos: [
        "Go to **Purchases** and tap **New purchase**.",
        "Choose the supplier and add the products with their cost. If a product doesn't exist, it's created right there.",
        "If you paid shipping, enter it: Nexo splits it among the products according to each one's value.",
        "If you have the supplier's invoice, enter its letter and number.",
        "Confirm it. While it's ordered or on the way, stock doesn't change: it goes up when you mark it as received."
      ] },
      "When it's received, Nexo updates each product's cost with the average of what you had and what came in."
    ]
  },
  "compra-desde-factura": {
    titulo: "Recording a purchase from a photo of the invoice",
    pantalla: "Purchases",
    preguntas: ["how do i record a purchase with a photo", "can i upload the supplier's invoice", "how do i record a purchase from the pdf", "how do i enter a pack of 12", "how do i scan an invoice"],
    palabras: ["photo", "invoice", "delivery note", "pdf", "scan", "upload", "camera", "pack", "box", "case", "supplier"],
    bloques: [
      { pasos: [
        "Go to **Purchases**, tap **New purchase** and then **Load from the invoice**.",
        "Take a photo of the invoice or delivery note (on the phone the camera opens), or choose the PDF the supplier sent you. If it has several pages, choose them together.",
        "Nexo fills in the supplier, the number, the date and each product with its quantity and cost. Under each line you see how it appeared on the invoice.",
        "Check the ones marked **Similar** or **New**: choose the product from your catalog or leave it to be created.",
        "Tap **Save draft** and continue as with any purchase."
      ] },
      "Packs come in as units: 2 packs of 12 sodas are 24 sodas, each with its cost. If a pack has a different amount, fix it in **Each one has**.",
      { nota: "What you confirm is remembered for that supplier: their next invoice comes out on its own. If what was loaded doesn't match the invoice total, Nexo warns you." },
      { nota: "It's part of the Pro plan." }
    ]
  },
  "pagar-proveedor": {
    titulo: "Paying a supplier",
    pantalla: "Purchases",
    preguntas: ["how do i pay a supplier", "how do i record a supplier payment", "how much do i owe the supplier"],
    palabras: ["pay", "payment", "supplier", "debt", "owe", "settle"],
    bloques: [
      { pasos: [
        "Open the purchase from **Purchases** and tap **Pay**.",
        "Enter how much you paid and which account the money came out of.",
        "Tap **Record payment**."
      ] },
      "What you owe all your suppliers is shown in **Accounts › Payable**."
    ]
  },
  proveedores: {
    titulo: "Suppliers",
    pantalla: "Suppliers",
    preguntas: ["how do i add a supplier", "where do i see what i bought from a supplier"],
    palabras: ["supplier", "suppliers", "vendor", "distributor", "wholesaler", "add"],
    bloques: [
      "In **Suppliers › New supplier** you enter their name, CUIT, VAT status and contact. On their profile you see what you bought from them and what you owe them.",
      "If you return goods to them, it's done from **Supplier returns**: the stock goes down and it's deducted from what you owe them."
    ]
  },
  "lista-proveedor": {
    titulo: "A supplier's price list",
    pantalla: "Suppliers",
    preguntas: ["how do i load a supplier's price list", "the supplier sent me new prices", "how do i update a supplier's costs", "which supplier sells cheapest"],
    palabras: ["list", "prices", "catalog", "supplier", "increase", "costs", "message", "pdf", "sheet", "compare"],
    bloques: [
      "When a supplier sends you their prices, you load them on their profile and Nexo matches them with your products.",
      { pasos: [
        "In **Suppliers**, open the supplier and tap **Load list**.",
        "Paste the message they sent you (or a sheet copied from Excel), or upload the PDF, the CSV sheet or a photo. Choose from when they apply and whether the prices include VAT or not.",
        "Review what it found: each line with its product, how many a pack contains and how much each one costs. What it didn't find you choose from your catalog, or leave out.",
        "Tap **Save**."
      ] },
      { lista: [
        "On the supplier's profile you see what they charge today for each product, how much it went up or down against the previous list, and your cost today.",
        "When you enter a purchase from that supplier, each product's cost comes from their list. You can change it.",
        "On each product's profile you see what each supplier charges you, from cheapest to most expensive.",
        "That supplier's next list finds on its own what you already chose."
      ] },
      { nota: "The list doesn't change your products' cost: that comes from what you bought. A list loaded by mistake is deleted from **Loaded lists**, and the previous list's prices come back. Reading a photo is part of the Pro plan; the message, the sheet and the PDF are for everyone." }
    ]
  },
  stock: {
    titulo: "Viewing and adjusting stock",
    pantalla: "Stock",
    preguntas: ["how do i see the stock", "how do i fix the stock", "how do i adjust the inventory", "a product broke", "how do i record lost goods", "why did the stock change"],
    palabras: ["stock", "inventory", "adjustment", "adjust", "fix", "shrinkage", "broken", "loss", "expired", "history", "movements", "count"],
    bloques: [
      "In **Stock** you see how much there is of each product in each warehouse. Every sale, purchase or return moves it on its own.",
      { pasos: [
        "If you counted and it doesn't match, or something broke or expired, tap **Adjust stock**.",
        "Choose the product, the real quantity or the difference, and the reason.",
        "Tap **Save adjustment**."
      ] },
      "In the **Movement history** you see every change: when, who and why."
    ]
  },
  depositos: {
    titulo: "Several warehouses and transfers",
    pantalla: "Stock",
    preguntas: ["how do i move goods from one warehouse to another", "i have two stores", "how do i add a warehouse", "how do i transfer stock"],
    palabras: ["warehouse", "warehouses", "store", "stores", "two", "transfer", "move", "storage"],
    bloques: [
      "If you keep goods in more than one place, each one is a warehouse with its own stock.",
      { pasos: [
        "Add the warehouses from **Stock › Warehouses**.",
        "To move goods, tap **Transfer**, choose from where to where and how much."
      ] }
    ]
  },
  "que-reponer": {
    titulo: "What to restock",
    pantalla: "Stock reports",
    preguntas: ["what do i need to buy", "which products are running out", "what is out of stock", "what sells fastest"],
    palabras: ["restock", "reorder", "missing", "minimum", "low", "sold out", "turnover", "buy"],
    bloques: [
      "In **Stock reports** you see what's below the minimum, what's out of stock and how fast each product turns over.",
      "Each product's minimum is set on the product."
    ]
  },
  caja: {
    titulo: "Cash and accounts",
    pantalla: "Cash",
    preguntas: ["how much money do i have", "how do i add a bank account", "how do i add mercado pago", "how do i move money from one account to another", "how do i record money coming in", "how do i take money out of the register"],
    palabras: ["cash", "account", "accounts", "bank", "mercado", "pago", "wallet", "balance", "money", "transfer", "movement", "income", "withdrawal", "treasury"],
    bloques: [
      "In **Cash** you have your accounts (cash, bank, Mercado Pago) with what's in each one.",
      { lista: [
        "**Account**: adds a new account, with its opening balance.",
        "**Transfer**: moves money from one account to another (depositing cash in the bank).",
        "**Movement**: income or an outflow that isn't a sale, a purchase or an expense."
      ] },
      "Payments received, payments made and expenses move these accounts on their own. An uncollected sale doesn't add to the cash until you collect it."
    ]
  },
  "registrar-gasto": {
    titulo: "Recording an expense",
    pantalla: "Expenses",
    preguntas: ["how do i record an expense", "how do i record the rent", "where do i put electricity", "how do i record a salary", "how do i create an expense category", "how do i record an owner withdrawal"],
    palabras: ["expense", "expenses", "rent", "electricity", "water", "gas", "internet", "utilities", "salary", "tax", "fuel", "advertising", "withdrawal", "investment", "category", "paid"],
    bloques: [
      "An expense is what you pay to keep the business running and isn't goods to resell: rent, electricity, internet, advertising, fuel.",
      { pasos: [
        "Go to **Expenses** and tap **New expense**.",
        "Choose the category, the amount and which account the money came out of.",
        "Tap **Record expense**."
      ] },
      "Categories are set up in **Expenses › Categories**. Each one says whether it's an operating expense, an investment (a new fridge) or an owner withdrawal: that way the Dashboard calculates the result correctly.",
      "From the assistant: \"I paid 25 thousand for electricity in cash\".",
      "If it repeats (rent, electricity), tick **It repeats**: see **Recurring expenses**."
    ]
  },
  "gastos-fijos": {
    titulo: "Recurring expenses",
    pantalla: "Expenses",
    preguntas: ["how do i record the rent every month", "how do i make a recurring expense", "can i record an expense that repeats", "how do i stop recording a recurring expense", "how do i record electricity that changes every month"],
    palabras: ["recurring", "repeat", "repeats", "monthly", "every month", "fixed", "rent", "electricity", "internet", "installment", "cancel", "skip"],
    bloques: [
      "Rent, electricity or internet are entered once and Nexo knows when they're due again.",
      { pasos: [
        "In **Expenses**, tap **New expense** and fill it in as always, with the date of the first time.",
        "Tick **It repeats** and choose how often: every month, every 2, 3 or 6 months, every year, every week or every 2 weeks.",
        "Choose what happens the next times: **Record it automatically** (on the day it's due, with the same amount and from the same account, like rent) or **Remind me to enter it** (for electricity or gas, which change).",
        "Tap **Record expense**."
      ] },
      "The ones that remind you show up at the top of **Expenses**, under **To enter**, and under **To review** on the Dashboard: tap **Record** and type the amount that came in. If one time isn't paid, **Not this time**.",
      "Under **Recurring expenses** you see each one with its next time. With the pencil you change the amount, the account or how it's recorded, and it applies to the next times. With the bin you cancel it: it's not recorded anymore and what was already recorded stays as it was.",
      "Each time is a regular expense: it comes out of the account and lowers the result. If you void one, that time isn't recorded again."
    ]
  },
  resumen: {
    titulo: "How the business is doing (Dashboard)",
    pantalla: "Dashboard",
    preguntas: ["how much did i sell this month", "how much did i make", "how do i see the profit", "what do i sell the most", "who are my best customers", "how do i see the statistics", "what is my margin"],
    palabras: ["dashboard", "statistics", "report", "reports", "profit", "made", "margin", "result", "sold", "month", "period", "trend", "best", "profitability", "numbers"],
    bloques: [
      "On the **Dashboard** you choose the period (today, 7 days, this month, the year or the dates you want) and you see:",
      { lista: [
        "what you sold, what it cost you, the profit, the expenses and the result, compared with the previous period or the same one last year;",
        "what to look at today: what you're owed, what you owe, what to restock and, under **To review**, what looked off this week (invoices without a CAE, cash shortfalls, products you bought at a higher cost without changing their price, recurring expenses that came due and are still to enter), each with a button to go fix it;",
        "when you sell, by day of the week and by hour;",
        "how the result is going month by month;",
        "what sells, by category, and the top customers;",
        "what's purchased and from whom;",
        "the VAT for the period."
      ] },
      "With **Customize** you choose which pieces to see, and you move each one by dragging it by its three lines. It starts with the ones for your type of business.",
      "The profit of each sale uses the cost the product had when you sold it, even if it changes later."
    ]
  },
  trabajos: {
    titulo: "Jobs (work orders)",
    pantalla: "Jobs",
    preguntas: ["how do i add a job", "how do i make a work order", "how do i organize the day's jobs", "how do i charge for a finished job"],
    palabras: ["job", "jobs", "order", "orders", "work", "service", "technician", "repair", "schedule", "assigned", "finished"],
    bloques: [
      { pasos: [
        "Go to **Jobs** and tap **New job**, or turn an accepted quote into a job.",
        "Enter the day, who does it and what's charged.",
        "When you finish it, turn it into a sale to charge it."
      ] },
      "The tabs separate what's to do, today's, what's finished and what's canceled."
    ]
  },
  abonos: {
    titulo: "Subscriptions (recurring charges)",
    pantalla: "Subscriptions",
    preguntas: ["how do i charge the same every month", "how do i make a subscription", "how do i add a recurring charge", "who owes the subscription"],
    palabras: ["subscription", "subscriptions", "monthly", "recurring", "fee", "repeat", "every", "months", "maintenance"],
    bloques: [
      "A subscription is a service a customer pays every so many months (monthly maintenance, for example).",
      "In **Subscriptions › New subscription** you choose the customer, the service and how often it's charged. Each fee is created like a sale, and in the \"They owe\" tab you see who's behind."
    ]
  },
  socios: {
    titulo: "Members, fees and check-in",
    pantalla: "Members",
    preguntas: ["how do i sign up a member", "how do i collect the fee", "how do i control who comes in", "which members owe", "how do i set up the gym plans", "where do i see this month's fees", "why aren't fees in sales", "how do i add a plan to a member"],
    palabras: ["member", "members", "fee", "fees", "gym", "plan", "plans", "check-in", "entry", "front desk", "membership", "discount", "bundle", "payment", "month", "prorated"],
    bloques: [
      { pasos: [
        "Set up the plans in **Plans**: price and duration (monthly, quarterly, yearly), and if you want, discounts and bundles.",
        "In **Members**, sign up the person (new, or already a customer) with their plan.",
        "The fee is due from the sign-up date. If they do several plans, it is **a single fee** with all of them inside: one payment a month, not one per plan."
      ] },
      "In **Fees** you see this month's: how much you collected, how much is left and how much is overdue, and you collect each one with a tap with the method they pay with (cash, debit, credit, transfer: the ones in **Settings › Payment methods**). **Another amount** is for a partial payment or the Mercado Pago QR. Fees don't show up in **Sales**, which is for what you sell at the counter.",
      "If you add a plan to a member mid-month, the first time they only pay the days left until their fee is due, and from then on it goes in the same fee.",
      "On the **Dashboard**, the **Members and fees** piece shows active members, sign-ups and cancellations, fees collected apart from counter sales, check-ins per day and who stopped coming.",
      "In **Check-in**, the front desk looks up the member when they arrive: Nexo warns you if they owe the fee.",
      "A **bundle** lowers the price when a member combines plans: by a percentage, or with a **fixed monthly price** (BJJ + MMA for $80,000). It can also lower just one plan if the member also does one of several others: functional training at half price if they do a martial art.",
      "In **Members**, the **Not coming** filter shows active members who haven't come in for two weeks or more, so you can call them before they quit. For someone who was already coming, the sign-up form takes the last time they came.",
      "**Seem to have quit** groups members who haven't come in a month and haven't paid the fee for a month they didn't come: most likely they quit without telling you. Nexo doesn't deactivate them on its own: in their record you choose to deactivate them clearing that debt or keeping it. If they come back, reactivate them and they pay from that day."
    ]
  },
  clases: {
    titulo: "The class schedule",
    pantalla: "Classes",
    preguntas: ["how do i set up the class schedule", "how do i add class times", "how do i assign an instructor to a class", "what classes are on today", "how do i share the schedule on instagram"],
    palabras: ["class", "classes", "schedule", "timetable", "time", "times", "activity", "activities", "instructor", "instructors", "coach", "capacity", "week"],
    bloques: [
      "**Classes** shows the gym's week: every activity with its times and who teaches each class. The whole team sees it; whoever runs the business sets it up.",
      { pasos: [
        "Tap **New activity**: the name (BJJ, Functional), the color and whether it's **Fixed** (classes at set times) or **Open** (available during a time window, like the weights room).",
        "Tap **New time slot**: the activity, the days (Tuesday and Thursday at 7 pm are added in one go), the start and end time, and the instructors. The detail (Beginners, Kids) and the capacity are optional.",
        "To change or remove a time slot, tap it on the schedule."
      ] },
      "Two classes can be at the same time: they go side by side. An instructor can't be in two classes at once; Nexo warns you.",
      "A class shared by several activities (sparring for Boxing, MMA and Kickboxing) is added once, ticking them all: it shows up on each one's schedule.",
      "Tap an activity above the schedule to see only its classes; tap it again to see them all. The image to share comes out filtered the same way.",
      "Instructors are the business's employees: if you add one from the schedule, they also show up in **Employees**.",
      "**Image to share** turns the week's schedule into an image for Instagram or your WhatsApp status: vertical, or horizontal and bigger; with a dark or light background. On a phone it's shared directly.",
      { nota: "On a phone the schedule shows one day at a time: choose the day at the top." }
    ]
  },
  "datos-del-negocio": {
    titulo: "Your business details",
    pantalla: "Settings › Business details",
    preguntas: ["how do i change the business name", "where do i enter the cuit", "how do i change the details on the invoice"],
    palabras: ["business", "details", "name", "cuit", "address", "phone", "company", "receipts"],
    bloques: [
      "In **Settings › Business details** go the name, the address, the phone and the email. They appear at the top of your receipts.",
      "In **Settings › Receipts and tax details** go the company name, the CUIT, your VAT status (it defines which invoice you can issue), gross income (IIBB), the start of activities and a footer text, with a preview."
    ]
  },
  "logo-y-colores": {
    titulo: "Your logo and your color",
    pantalla: "Settings › Logo and colors",
    preguntas: ["how do i add my logo", "how do i change nexo's color", "how do i put the logo on the invoice", "how do i add my profile photo"],
    palabras: ["logo", "color", "colors", "brand", "image", "photo", "profile", "receipt", "invoice", "customize"],
    bloques: [
      "In **Settings › Logo and colors** you upload your logo and choose your color. The logo goes at the top of the menu, on invoices, quotes, receipts and the gym's check-in screen.",
      "The color takes the place of Nexo's blue: the selected menu section, links and highlights. If you upload your logo, Nexo offers its colors. Nexo lightens or darkens it just enough to read well in the light and dark themes.",
      { nota: "A PNG with a transparent background looks best. On the receipt the logo prints in grayscale: thermal printers print in black." },
      "If your logo looks small in the menu (a round badge with a lot of margin), under **In the menu** zoom in with the slider and drag it until the important part shows. What gets printed still carries the whole logo.",
      "Your **profile photo** belongs to your account, not the business: you upload it in **Settings › My account** and it goes in the circle at the bottom of the menu."
    ]
  },
  funciones: {
    titulo: "Turning features on or off",
    pantalla: "Settings › Features",
    preguntas: ["how do i turn on the point of sale", "quotes don't show up", "how do i remove a section from the menu", "how do i change the business type"],
    palabras: ["features", "feature", "module", "activate", "turn on", "turn off", "section", "menu", "type", "appears"],
    bloques: [
      "Depending on the business type you chose, Nexo starts with some features turned on. You add the rest when you need them.",
      "In **Settings › Features** you turn the point of sale, online sales, leads (CRM), quotes, jobs, subscriptions, purchases, stock, production and members on or off. Turning one off doesn't delete anything.",
      "From there you can also **Change the type** of business: it only changes the unit a new product starts with."
    ]
  },
  equipo: {
    titulo: "Adding someone from your team",
    pantalla: "Settings › Users",
    preguntas: ["how do i add an employee", "how do i invite someone", "what does an employee see", "how do i remove an employee", "how do i create a user"],
    palabras: ["user", "users", "employee", "employees", "invite", "invitation", "team", "role", "permissions", "admin", "seller"],
    bloques: [
      { pasos: [
        "Go to **Settings › Users** and tap invite.",
        "Enter their email and their role, and tap **Send invitation**.",
        "They get an email to create their account and join your business."
      ] },
      { lista: [
        "**Admin**: sees and does everything.",
        "**Employee**: sells, collects and serves customers, but doesn't see costs, margins or profits, and can't go into the Dashboard, Purchases or the Trash."
      ] },
      "Every movement is recorded with who did it, in the Audit log."
    ]
  },
  "varios-negocios": {
    titulo: "More than one business",
    pantalla: "Settings",
    preguntas: ["i have two businesses", "how do i add another business", "how do i switch business"],
    palabras: ["businesses", "two", "another", "second", "switch", "add", "company", "selector", "branch"],
    bloques: [
      "With the same account you can run several businesses, each with its data kept separate.",
      "The selector at the top of the menu switches business, and **Add business** is right there."
    ]
  },
  papelera: {
    titulo: "Recovering something voided (Trash)",
    pantalla: "Trash",
    preguntas: ["how do i recover a voided sale", "where is what i deleted", "how do i restore an expense"],
    palabras: ["trash", "recover", "restore", "deleted", "voided", "undo"],
    bloques: [
      "What you void (sales, purchases, expenses, returns) goes to the **Trash**. From there, **Restore** puts it back the way it was, with its effect on stock and money."
    ]
  },
  auditoria: {
    titulo: "Who did what (Audit log)",
    pantalla: "Audit log",
    preguntas: ["who recorded this sale", "who changed the stock", "how do i see what an employee did"],
    palabras: ["audit", "log", "activity", "history", "who", "changed", "change"],
    bloques: [
      "The **Audit log** keeps everything that was done in the business: who, when and what changed, including each person's sign-ins and sign-outs and what the assistant recorded."
    ]
  },
  "mi-cuenta": {
    titulo: "Your password and your email",
    pantalla: "Settings › My account",
    preguntas: ["how do i change my password", "i forgot my password", "how do i change my email", "how do i sign out"],
    palabras: ["password", "forgot", "email", "mail", "session", "sign out", "log out", "account"],
    bloques: [
      "In **Settings › My account** you change your password or your email (we send you a code to confirm it) and sign out.",
      "If you forgot your password, on the sign-in screen tap **Forgot your password?**: you get a link by email to choose a new one."
    ]
  },
  "datos-y-baja": {
    titulo: "Downloading your data or closing",
    pantalla: "Settings › Your data and closing",
    preguntas: ["how do i download my data", "how do i close the business", "how do i delete my account", "can i export everything"],
    palabras: ["close", "download", "export", "data", "delete", "remove", "account", "csv", "backup"],
    bloques: [
      "In **Settings › Your data and closing** you download everything from your business, and you can close it: it stays closed for 30 days, during which you can go back, and then it's deleted.",
      "Lists (sales, expenses, stock) also have **Export CSV**, to open them in a spreadsheet."
    ]
  },
  "avisar-problema": {
    titulo: "Reporting a problem",
    pantalla: "Settings › Report a problem",
    preguntas: ["something doesn't work", "i found an error", "how do i report a problem", "how do i contact nexo", "i have an idea"],
    palabras: ["problem", "error", "bug", "broken", "works", "report", "support", "help", "contact", "idea", "suggestion"],
    bloques: [
      "If something doesn't work or isn't clear, tell us from **Settings › Report a problem** (or the circle with \"!\" at the bottom of the menu). Before you send it, the page shows you everything that's sent."
    ]
  },
  "lo-que-tenias": {
    titulo: "Entering what you already had",
    pantalla: "Settings › What you already had",
    preguntas: ["how do i enter the stock i already had", "how do i enter what customers owed me before", "how do i start if my business was already running", "how do i enter the money i have today", "how do i enter old debts with suppliers"],
    palabras: ["initial", "before", "had", "start", "stock", "debt", "debts", "balance", "money", "cash", "migrate", "old"],
    bloques: [
      "If your business was already running, enter what you have today and Nexo starts with your real numbers. It's in **Settings › What you already had**, in parts you enter separately and in any order:",
      { lista: [
        "**Your stock today**: how many of each product you have and what each one cost you. With that cost Nexo calculates the profit of each sale.",
        "**What you're owed**: what each customer still owed you. It goes to their account and is collected like any sale.",
        "**What you owe**: what you owed your suppliers. It's paid like any purchase.",
        "**Your money today**: how much there is in the till, the bank and Mercado Pago.",
        "**Recent sales** (optional): this week's or this month's, so your reports don't start empty."
      ] },
      { nota: "None of this makes up purchases or sales: the stock doesn't create debts or touch the cash, and recent sales don't deduct stock or add to the cash, because what you entered is already today's." }
    ]
  },
  "desde-planilla": {
    titulo: "Importing products, customers or suppliers from Excel",
    pantalla: "Settings › What you already had › Import from a spreadsheet",
    preguntas: ["how do i import my products from excel", "how do i bring my customers from a spreadsheet", "can i upload an excel file with my products", "how do i upload many products at once", "how do i update prices from a spreadsheet"],
    palabras: ["excel", "spreadsheet", "import", "csv", "xlsx", "upload", "bulk", "many", "list", "migrate"],
    bloques: [
      "If you already had your products, customers or suppliers in a spreadsheet, bring them in all at once with your own columns, without copying them into any template.",
      { pasos: [
        "Go to **Settings › What you already had › Import from a spreadsheet** (or tap **From a spreadsheet** in Products, Customers or Suppliers).",
        "Choose what you're importing and upload the Excel (.xlsx) or CSV file. You can also copy the columns in Excel and paste them.",
        "Nexo guesses what each column is from its header (\"Price\", \"Barcode\", \"CUIT\"). Fix any that's wrong, or mark it **Don't use**.",
        "Tap **Review**: each row says whether it's **New**, whether it **Changes** (with what it had and what it will have) or why it's **Not imported**.",
        "Tap **Import**. Rows with an error are left out: fix them in the spreadsheet and upload it again."
      ] },
      { nota: "A product you already have is found by its code, barcode or name; a customer or supplier, by CUIT, email or name. An empty cell doesn't erase anything. The stock in the spreadsheet is today's stock in the warehouse you choose, with its cost, like **Your stock today**: it doesn't make up purchases. Categories that don't exist are created automatically." }
    ]
  },
  notificaciones: {
    titulo: "Notifications on your phone and computer",
    pantalla: "Settings › Notifications",
    preguntas: ["how do i turn on notifications", "can it tell me when stock runs out", "how do i find out about an online sale", "i don't get the alerts"],
    palabras: ["notifications", "notification", "alerts", "alert", "push", "phone", "warn"],
    bloques: [
      "Nexo can alert you on your phone or computer even when it isn't open.",
      { pasos: [
        "From each device where you want the alerts, go to **Settings › Notifications**.",
        "Tap **Turn on notifications** and accept the browser's permission.",
        "With **Send a test one** you see how they arrive."
      ] },
      { lista: [
        "When a product is running low or is out of stock.",
        "When a sale comes in from Tienda Nube or Mercado Libre.",
        "When you get paid with Mercado Pago.",
        "At the gym, when a member is waiting at the entrance."
      ] },
      "Stock, online sales and payment alerts go to whoever runs the business. Logging out turns them off on that device."
    ]
  },
  whatsapp: {
    titulo: "Recording through WhatsApp",
    pantalla: "Settings › WhatsApp",
    preguntas: ["can i record a sale through whatsapp", "how do i link my whatsapp", "can i send nexo a voice note"],
    palabras: ["whatsapp", "message", "audio", "voice", "link", "number", "phone"],
    bloques: [
      "You send Nexo what you sold, bought or spent, in writing or as a voice note, without opening the app. It replies with how it understood it, and nothing is recorded until you tap **Confirm**.",
      { pasos: [
        "Go to **Settings › WhatsApp** and tap **Link my WhatsApp**.",
        "From your phone, send Nexo's number the message it shows you.",
        "Done: tell it what happened as you would a person (\"I sold 2 hoodies to Sole at 28 thousand each, she paid cash\")."
      ] },
      "It's recorded in the business you linked the number to. A return is finished in Nexo: it sends you the link.",
      { nota: "If you don't see WhatsApp in Settings, it isn't available in your Nexo yet." }
    ]
  },
  ofertas: {
    titulo: "Promotions and offers",
    pantalla: "Promotions",
    preguntas: ["how do i make an offer", "how do i put a product on sale", "how do i make a quantity discount", "how do i lower a price for a few days", "how do i make a tuesday promo"],
    palabras: ["offer", "offers", "promotion", "promotions", "promo", "discount", "sale", "clearance", "quantity", "day", "week"],
    bloques: [
      "A promotion lowers the price for a while without touching your price lists. It starts and ends on its own, and the point of sale and sales apply it.",
      { pasos: [
        "In **Products**, tap **Promotions** and then **New promotion**.",
        "Choose how much it drops: a percentage off, an amount off or a fixed price. With a minimum quantity it's a quantity promotion (\"2 kg or more at $ 9,000 a kilo\").",
        "Choose what it applies to: products, categories or the whole catalog, and on which price list.",
        "Choose from and until when and, if you want, which days of the week or the month.",
        "Tap **Save promotion**."
      ] },
      "If two promotions cover the same thing, they don't add up: the cheaper one wins. In **Prices on a given day** you see how each price looks that day.",
      "For a discount on a single sale, without creating a promotion, use **Discount** at the point of sale."
    ]
  },
  produccion: {
    titulo: "Production: recipes and what you make",
    pantalla: "Production",
    preguntas: ["how do i enter a recipe", "how do i record what i produced", "how much does it cost me to make a product", "how do i deduct the box or bag when selling", "how do i enter supplies"],
    palabras: ["production", "produce", "recipe", "recipes", "make", "manufacture", "supply", "supplies", "materials", "yield", "packaging", "box", "bag"],
    bloques: [
      "If you make what you sell (food, candles, clothes), Production works out the cost of each thing from the materials it takes.",
      { pasos: [
        "In **Production › Recipes**, tap **New recipe**: choose what is made, how much it yields and what materials it takes. Materials are products like any other: you buy them with your usual purchases, and their cost comes from there.",
        "When you make a batch, tap **Produce**: choose what you made and how much you meant to make. Nexo suggests the recipe's materials: correct what you really used.",
        "Enter how much really came out and save it. The materials leave the stock, what you made comes in, and its cost comes from what you used."
      ] },
      "In **When selling** you enter what's used when selling without being sold: each item's box, or the bag once per sale. When selling, Nexo suggests it and you change it on the spot if that time was different: it leaves the stock and goes into the sale's cost.",
      { nota: "If you don't see Production in the menu, turn it on in Settings › Features." }
    ]
  },
  balanza: {
    titulo: "Scale and barcode labels",
    pantalla: "Settings › Scale",
    preguntas: ["how do i use the scale", "does the point of sale read the scale label", "how do i sell by weight with a label", "what is the plu"],
    palabras: ["scale", "label", "labels", "weight", "weigh", "plu", "code", "kilo", "deli", "meat", "produce"],
    bloques: [
      "If your scale prints labels with a barcode, the point of sale reads them: the product comes in with its weight, at today's price in Nexo (never the label's).",
      { pasos: [
        "Weigh any product on the scale and print the label.",
        "In **Settings › Scale**, scan the label and copy what's printed on it: the product's code on the scale (PLU) and the weight or the amount. Nexo works out on its own how your scale builds the code.",
        "Tap **Test the label** and then **Use this format**.",
        "On each product you weigh, enter its **Scale code (PLU)**: the number it has on the scale."
      ] }
    ]
  },
  "medios-cobro": {
    titulo: "Payment methods: cards, installments and fees",
    pantalla: "Settings › Payment methods",
    preguntas: ["how do i enter the card fee", "how do i offer installments", "how do i add modo or cuenta dni", "which account does debit go into", "how do i set up the card reader"],
    palabras: ["method", "methods", "payment", "card", "debit", "credit", "installments", "fee", "reader", "modo", "wallet", "transfer"],
    bloques: [
      "Payment methods are the ways customers pay you at the counter: cash, debit, credit, transfer, MODO… Each one says which account the money goes into.",
      { pasos: [
        "Go to **Settings › Payment methods** and tap **Add a payment method**.",
        "Enter the name, the type and which account it goes into. Cash always goes into the shift's till, so the cash count adds up.",
        "Enter the fee and in how many days the money arrives. The fee is recorded automatically as an expense of each sale.",
        "For credit, add the installment plans you offer and, if they're interest-free for the customer, what offering them costs you: that's also recorded as a sale expense.",
        "Tap **Add method**."
      ] },
      "When charging by transfer, at the counter you choose which account it landed in (the bank, Mercado Pago…).",
      { nota: "What you collect with your Mercado Pago connected doesn't need to be set up here: Nexo records the real cost of each payment." }
    ]
  },
  "turno-mostrador": {
    titulo: "During the shift: payments on account, register expenses and voids",
    pantalla: "Point of sale",
    preguntas: ["how do i collect a debt at the counter", "a customer comes to pay what they owe", "how do i record cash taken from the register", "how do i void a counter sale", "how do i reprint a receipt", "how do i set up quick picks"],
    palabras: ["account", "debt", "credit", "expense", "register", "bags", "void", "reprint", "receipt", "quick", "picks", "shift"],
    bloques: [
      "With the register open, at the top of the counter you have everything that happens in the shift, without leaving the screen.",
      { pasos: [
        "**Collect on account**: the customer pays their debt without taking anything. Choose them, enter how much and how they pay: the oldest is settled first, and a slip prints with what they still owe.",
        "**Register expense**: what comes out of the drawer (bags, freight, a repair). It's taken off what should be in the register and stays in Expenses.",
        "**Shift sales**: each sale of the shift, to reprint the receipt or void it with the reason. What was collected comes back out of the drawer and the stock goes back to the warehouse.",
        "**Quick picks**: tap **Set up quick picks**, mark your usual products and tap **Done**. They're saved on that register."
      ] },
      { nota: "An employee can only void with an administrator's email and password, right there. A sale from a closed shift, or with an invoice, is returned from Sales." }
    ]
  },
  sucursales: {
    titulo: "Branches and the day close",
    pantalla: "Settings › Branches",
    preguntas: ["how do i add another store", "i have two branches", "how do i see the day's register close", "how much did all the registers sell", "how do i make a register sell from its warehouse", "how do i see the month close"],
    palabras: ["branch", "branches", "store", "stores", "close", "day", "month", "registers", "warehouse", "count", "differences"],
    bloques: [
      "If you have more than one store, each branch groups its warehouse, its registers and the people who work there.",
      { pasos: [
        "Go to **Settings › Branches** and tap **Add a branch**.",
        "Enter the name and choose its warehouse: one you already have or a new one with the branch's name.",
        "Check its registers (or create a new one) and who works there. Someone with branches only opens those registers.",
        "Tap **Add branch**."
      ] },
      "Each register only sells what's in its branch's warehouse. If a product isn't there, the counter says which other branch has it, so you can send the customer.",
      "The **Register close** (from **Cash** or the point of sale) adds up every register of every branch: what was sold, how you were paid, what left the drawer, the differences and what was sold outside the registers. **Monthly** also shows it day by day."
    ]
  },
  horarios: {
    titulo: "Schedules, clocking in and PIN",
    pantalla: "Staff",
    preguntas: ["how do i add a staff member", "how do i give them a pin", "how do i clock in", "how do i clock out", "how do i set an employee's schedule", "who arrived late", "how many hours did they work", "did they complete the shift", "they forgot to clock out"],
    palabras: ["staff", "employee", "employees", "pin", "supervisor", "schedule", "schedules", "clock", "in", "out", "late", "hours", "absent", "absence", "shift", "shifts", "completed"],
    bloques: [
      "Staff don't need a Nexo account: you add them, with their name and a PIN, and they serve and clock in on the till computer.",
      { pasos: [
        "In **Staff** › **Add staff member**, enter the name and a 4 to 6 digit PIN. If you have branches, choose where they work. Check **Is a supervisor** if they authorize voiding a sale at the till.",
        "If that person also has a Nexo account (a supervisor, yourself), choose it in **Their Nexo account**: then they can also clock in from their phone.",
        "Tap **Schedule** to set their days and hours (with a split shift, both blocks).",
        "In **Who came and how long they worked** you see, for today, the week or the month, how many shifts each person completed, their hours, late arrivals and absences. Each shift says whether it was completed, whether they came in late or left early, or were absent.",
        "If someone forgot to clock in or out, tap **Fix** on that day and enter the time: it's marked as fixed and recorded in the audit log."
      ] },
      { nota: "Arriving up to 5 minutes late, or leaving up to 5 minutes early, doesn't count. Nexo says which shifts were completed; payroll isn't done in Nexo." }
    ]
  },
  "caja-vinculada": {
    titulo: "The till computer",
    pantalla: "Point of sale",
    preguntas: ["how do i set the computer as a till", "how does a staff member without an account serve", "how does a staff member clock in at the till", "how do i change who is serving", "how do i unlink the computer"],
    palabras: ["computer", "till", "link", "unlink", "pin", "serve", "serving", "lock", "handover", "clock", "staff"],
    bloques: [
      "The counter computer has its own account: without yours signed in, it only sells at that till. Nobody sells or changes anything from home.",
      { pasos: [
        "At the shop, sign in to the **Point of sale**, choose the till and tap **Use this computer as a till**. Then sign out.",
        "The computer stays on **Who's at the till?**: each staff member taps their name, enters their PIN and taps **Serve**. Sales are recorded under their name.",
        "For a handover, **Lock**: the shift and the sale in progress stay, and the next person serves with their PIN.",
        "Clocking in is a separate button: with the PIN, **Clock in** or **Clock out**. Unlocking the till isn't clocking in."
      ] },
      { lista: [
        "**Voiding a sale**: if the person serving isn't a supervisor, a supervisor authorizes it with their PIN.",
        "**Sign in with my account**: from the till, the owner signs in to their account; after signing out, the computer goes back to being the till.",
        "**Unlink**: from your account, in the same spot of the point of sale."
      ] }
    ]
  },
  "mercado-pago": {
    titulo: "Charging with Mercado Pago",
    pantalla: "Settings › Mercado Pago",
    preguntas: ["how do i connect mercado pago", "how do i send a payment link", "how do i set up the counter qr", "should i offer installments with mercado pago"],
    palabras: ["mercado", "pago", "mp", "link", "qr", "connect", "installments", "fee", "sign"],
    bloques: [
      "With your Mercado Pago account connected, you charge with a link or with the counter QR, and the payment comes into Nexo on its own, with the fee and the installment cost recorded as expenses of that sale.",
      { pasos: [
        "Go to **Settings › Mercado Pago** and tap **Connect my Mercado Pago**: it takes you to Mercado Pago to give Nexo permission, and you come back on your own. Nexo never asks for your password and can't take money from your account.",
        "Choose which Cash account the payments go into.",
        "For the counter, enter the shop's address and tap **Set up the checkout**. Then **Download the sign to print** gives you the QR to stick on the counter."
      ] },
      { lista: [
        "**Payment link**: when charging a sale or a debt, **Send a payment link**. You send it by WhatsApp. Its fee is higher than the QR's.",
        "**QR when charging a sale or a debt**: with the checkout set up, **Charge with QR** in **Record payment**. If they don't pay, **Didn't pay**.",
        "**Counter QR**: when charging, **Charge with a Mercado Pago QR**. The payment comes in when they pay."
      ] },
      "In **Is it worth offering installments?** you see what each plan costs you and how much to charge to keep the same.",
      { nota: "It starts with the Entrepreneur plan." }
    ]
  },
  "tiendas-online": {
    titulo: "Connecting Tienda Nube and Mercado Libre",
    pantalla: "Settings › Tienda Nube",
    preguntas: ["how do i connect tienda nube", "how do i connect mercado libre", "how do i sync stock with my store", "how do i publish my products on tienda nube", "do mercado libre sales come in on their own"],
    palabras: ["store", "tienda", "nube", "tiendanube", "mercado", "libre", "online", "internet", "publish", "listings", "sync", "ecommerce", "web"],
    bloques: [
      "If you sell online, connect your store: stock and price stay up to date on their own, and each store sale comes in as a Nexo sale.",
      { pasos: [
        "Go to **Settings › Tienda Nube** (or **Mercado Libre**) and tap **Connect my Tienda Nube** (or **Connect my Mercado Libre**). It takes you to the store to give Nexo permission, and you come back on your own.",
        "Choose which price list the price comes from, which warehouse the stock comes from and which account the payments go into.",
        "In Tienda Nube, choose which products to **Publish**: they're created with their name, variants, price and stock, and photos are added in Tienda Nube. If the store already had products, **Bring in what I already have in the store**.",
        "In Mercado Libre, **Link** each listing to its Nexo product. If they have the same SKU, it's already chosen. Nexo doesn't create or delete listings."
      ] },
      "Nexo is in charge: if you change the stock or the price in the store, Nexo sets it back to what it is here. If you sell at a higher price on Mercado Libre because of the fee, create a price list for Mercado Libre.",
      "A sale paid online comes in as collected; one they pay by transfer or in cash, as pending.",
      { nota: "It starts with the Entrepreneur plan. If you don't see Sales channels in Settings, turn on Online sales in Features." }
    ]
  },
  "venta-online": {
    titulo: "What each channel leaves you (Online sales)",
    pantalla: "Online sales",
    preguntas: ["how much do i sell on mercado libre", "which channel leaves me the most", "how much does mercado libre charge me", "how do i note a sale came from instagram", "does my advertising pay off"],
    palabras: ["channel", "channels", "online", "instagram", "store", "mercado", "libre", "fee", "advertising", "profit", "ticket"],
    bloques: [
      "Each sale keeps where it came in from: the shop, Tienda Nube, Mercado Libre, Instagram, WhatsApp… Those from connected stores are recorded on their own, and in a sale entered by hand you choose it in **Where they bought from**.",
      "In **Online sales** you see, by period, how much you sold online and, for each channel, where the money went: the goods, what the channel charges for selling there (fee, shipping, installments) and what you kept. Also the best sellers in each channel and how the advertising you record in Expenses pays off."
    ]
  },
  "factura-por-mail": {
    titulo: "Sending the invoice by email",
    pantalla: "Invoices",
    preguntas: ["how do i send the invoice by email", "how do i send the invoice to the customer", "can i send several invoices at once", "how do i send invoices from my gmail"],
    palabras: ["email", "mail", "send", "invoice", "invoices", "pdf", "gmail", "attachment"],
    bloques: [
      { pasos: [
        "Open the invoice and tap **Send by email**, or tick several in **Invoices** and tap **Send by email**: each one goes to its customer's email.",
        "Check the email and tap **Send**. It goes with the PDF attached, in your business's name. If the customer had no email, you can save it on their record."
      ] },
      "Invoices go out from your business's Gmail: connect it once in **Settings › Gmail** and your customers reply to you and they stay in \"Sent\". Nexo only asks permission to send: it can't read or delete your emails. Without connecting it, invoices can't be sent by email.",
      { nota: "It starts with the Entrepreneur plan, like electronic invoicing. An electronic invoice without a CAE can't be sent yet." }
    ]
  },
  "unir-repetidos": {
    titulo: "Merging duplicate customers or suppliers",
    pantalla: "Customers",
    preguntas: ["i have a customer entered twice", "how do i merge two customers", "how do i merge duplicate suppliers", "i entered the same customer twice"],
    palabras: ["merge", "join", "duplicate", "duplicates", "repeated", "twice", "same"],
    bloques: [
      { pasos: [
        "In **Customers** (or **Suppliers**), tick the duplicates.",
        "Tap **Merge** on the bar at the bottom.",
        "Choose which one stays and tap **Merge**."
      ] },
      "Everything from the others moves to the one that stays: sales, payments, invoices, quotes and the account (for a supplier, its purchases and payments), and any missing contact details are filled in. The others are deleted. Invoices already issued don't change."
    ]
  },
  plan: {
    titulo: "Nexo's plans",
    pantalla: "Settings › Nexo plan",
    preguntas: ["how much does nexo cost", "what does the free plan include", "how do i switch plans", "which plan do i need for electronic invoicing"],
    palabras: ["plan", "plans", "price", "free", "entrepreneur", "pro", "pay", "subscription", "limit", "cost"],
    bloques: [
      "Every plan has the features to run your business; what changes is how far you can go.",
      { lista: [
        "**Free**: up to 100 products and 300 sales a month, one user, and receipts with the Nexo brand.",
        "**Entrepreneur**: no limits on products or sales, up to 3 users, electronic invoicing, invoices by email, Tienda Nube, Mercado Libre and Mercado Pago, and receipts without the Nexo brand.",
        "**Pro**: all of that, plus the AI assistant, purchases from a photo of the invoice, unlimited users and several businesses with the same account."
      ] },
      "In **Settings › Nexo plan** you see the prices, what you're using, and you ask to switch: we write to you to activate it, and meanwhile you keep using Nexo as always.",
      { nota: "If you move to a plan that doesn't include something you were using (electronic invoicing, a connected store), it's paused: nothing is deleted." }
    ]
  }

};
