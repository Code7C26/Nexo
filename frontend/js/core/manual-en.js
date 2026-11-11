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
      "If you're just starting, on the Dashboard you'll see a getting-started guide: add a product, a customer and your first sale."
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
      { nota: "So it understands you better, name the products the way they're entered. If a product doesn't exist, the sale can't be confirmed until you fix it; in a purchase, the new product is created automatically." }
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
      "To change a price, open the product from the list and edit it. The code or SKU is for finding it quickly and for the barcode scanner.",
      { nota: "The cost updates on its own every time you record a purchase: Nexo averages what you had and what came in." }
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
    preguntas: ["how do i sell at the counter", "how do i open the register", "how do i close the register", "how do i charge with the scanner", "how do i count the cash", "how do i give change", "how do i charge with two payment methods"],
    palabras: ["counter", "point", "pos", "register", "cash", "shift", "open", "close", "count", "change", "scanner", "scan", "barcode", "charge", "quick"],
    bloques: [
      "It's the screen for selling fast, standing in front of the customer.",
      { pasos: [
        "At the start of the day, tap **Open register** and count the cash you start with.",
        "Search for each product by name or code, or scan it (your phone's camera works too).",
        "Tap **Charge** and choose how they pay: cash, transfer, card… They can pay with more than one. If it's cash, Nexo calculates the change.",
        "At the end of the day, tap **Close register** and count the cash: Nexo tells you if it matches what there should be."
      ] },
      "Without choosing a customer, the sale goes to End consumer. To leave something on account for someone, choose the customer: End consumer can't buy on credit.",
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
      "When it's recorded, Nexo deducts the stock, keeps the cost at that moment to calculate the profit and, if something was left uncollected, adds it to what the customer owes you.",
      "You can also record it from the assistant: \"I sold 2 hoodies to Sole at 28 thousand each, she paid cash\"."
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
      "The payment lowers what the customer owes and adds the money to that account in Cash."
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
      "The products go back to stock and it's deducted from the sale. If the sale was invoiced, from the return you tap **Issue credit note**.",
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
    preguntas: ["how do i make an invoice", "how do i invoice a sale", "how do i print an invoice", "how do i get the invoice pdf", "which invoice letter do i use", "a or b invoice"],
    palabras: ["invoice", "invoices", "receipt", "print", "pdf", "ticket", "letter"],
    bloques: [
      "You can invoice a sale you already recorded, or make a standalone invoice.",
      { pasos: [
        "For a sale: open it and tap **Invoice**. For a standalone one: **Invoices › New invoice**.",
        "Check the customer's details and the sale terms.",
        "Tap **Generate invoice**. From its profile, **Print / PDF**."
      ] },
      "The letter (A, B or C) is set automatically, based on your VAT status and the customer's.",
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
        "Enter your CUIT, your VAT status and the point of sale, and tap **Verify with ARCA**.",
        "Done: when you make an invoice, Nexo requests the CAE from ARCA. If ARCA doesn't respond, it stays pending and is retried with **Request the CAE from ARCA**."
      ] },
      { nota: "Today it works in ARCA's test environment: receipts say \"Comprobante de prueba – sin validez fiscal\" (test receipt, no tax validity)." },
      { nota: "It starts with the Entrepreneur plan. If your business moves to Free, it's paused: turn it off to keep issuing internal receipts, or go back to a paid plan." }
    ]
  },
  iva: {
    titulo: "VAT",
    pantalla: "Settings › Business details",
    preguntas: ["how do i enter vat", "where do i see vat", "does the price include vat", "i am vat registered", "i am a monotributista", "vat book"],
    palabras: ["vat", "tax", "rate", "registered", "monotributo", "exempt", "consumer", "status", "book", "credit"],
    bloques: [
      { lista: [
        "**Your status** (VAT registered, monotributo, exempt) goes in Settings › Business details.",
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
      { nota: "What you confirm is remembered for that supplier: their next invoice comes out on its own. If what was loaded doesn't match the invoice total, Nexo warns you." }
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
      "From the assistant: \"I paid 25 thousand for electricity in cash\"."
    ]
  },
  resumen: {
    titulo: "How the business is doing (Dashboard)",
    pantalla: "Dashboard",
    preguntas: ["how much did i sell this month", "how much did i make", "how do i see the profit", "what do i sell the most", "who are my best customers", "how do i see the statistics", "what is my margin"],
    palabras: ["dashboard", "statistics", "report", "reports", "profit", "made", "margin", "result", "sold", "month", "period", "trend", "best", "profitability", "numbers"],
    bloques: [
      "On the **Dashboard** you choose the period (this month, the previous one, the year) and you see:",
      { lista: [
        "what you sold, what it cost you, the profit, the expenses and the result, compared with the previous period;",
        "how the result is going month by month;",
        "what sells, by category, and the top customers;",
        "what's purchased and from whom;",
        "the VAT for the period."
      ] },
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
    preguntas: ["how do i sign up a member", "how do i collect the fee", "how do i control who comes in", "which members owe", "how do i set up the gym plans"],
    palabras: ["member", "members", "fee", "fees", "gym", "plan", "plans", "check-in", "entry", "front desk", "membership", "discount", "bundle"],
    bloques: [
      { pasos: [
        "Set up the plans in **Plans**: price and duration (monthly, quarterly, yearly), and if you want, discounts and bundles.",
        "In **Members**, sign up the person (new, or already a customer) with their plan.",
        "The fee is due from the sign-up date and is collected like any sale."
      ] },
      "In **Check-in**, the front desk looks up the member when they arrive: Nexo warns you if they owe the fee."
    ]
  },
  "datos-del-negocio": {
    titulo: "Your business details",
    pantalla: "Settings › Business details",
    preguntas: ["how do i change the business name", "where do i enter the cuit", "how do i change the details on the invoice"],
    palabras: ["business", "details", "name", "cuit", "address", "phone", "company", "receipts", "logo"],
    bloques: [
      "In **Settings › Business details** go the name, the CUIT, your VAT status, the address and the phone. They appear on your quotes and invoices.",
      "In **Settings › Receipts** go the company name, gross income (IIBB) and start of activities the invoice asks for, with a preview."
    ]
  },
  funciones: {
    titulo: "Turning features on or off",
    pantalla: "Settings › Features",
    preguntas: ["how do i turn on the point of sale", "quotes don't show up", "how do i remove a section from the menu", "how do i change the business type"],
    palabras: ["features", "feature", "module", "activate", "turn on", "turn off", "section", "menu", "type", "appears"],
    bloques: [
      "Depending on the business type you chose, Nexo starts with some features turned on. You add the rest when you need them.",
      "In **Settings › Features** you turn the point of sale, leads (CRM), quotes, jobs, subscriptions, purchases, stock and members on or off. Turning one off doesn't delete anything.",
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
  }
};
