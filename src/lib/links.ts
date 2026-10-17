/**
 * Where a record opens in the app, from the type and id stored with it (khata rows, activity log,
 * stock history, price history…). Receipts and printouts open in a new tab. Null = nothing to open.
 */
export function refLink(refType?: string | null, refId?: string | null): { href: string; newTab: boolean } | null {
  if (!refType) return null;
  const page = (href: string) => ({ href, newTab: false });
  const print = (href: string) => ({ href, newTab: true });
  if (!refId) {
    // Records without an id still have a home page.
    const home: Record<string, string> = { wallet: "/wallets", transfer: "/transfers", production: "/production", promotion: "/promotions", expense: "/expenses", device: "/phones", user: "/settings", branch: "/settings" };
    return home[refType] ? page(home[refType]) : null;
  }
  switch (refType) {
    case "sale":
      return print(`/receipt/${refId}`);
    case "return":
      return print(`/receipt/return/${refId}`);
    // Khata payments: the receipt / payment voucher.
    case "payment":
    case "ledger":
    case "reversal":
      return print(`/receipt/payment/${refId}`);
    case "shift":
      return print(`/receipt/shift/${refId}`);
    case "used_buy":
      return print(`/receipt/used/${refId}`);
    case "repair":
      return page(`/repairs/${refId}`);
    case "installment":
      return page(`/installments/${refId}`);
    case "purchase":
      return page(`/purchases?id=${refId}`);
    case "purchase_return":
      return page(`/purchases?return=${refId}`);
    case "party":
      return page(`/party/${refId}`);
    case "product":
      return page(`/products?id=${refId}`);
    case "production":
      return page("/production");
    case "wallet":
      return page("/wallets");
    case "transfer":
      return page("/transfers");
    case "promotion":
      return page("/promotions");
    case "expense":
      return page("/expenses");
    case "device":
      return page("/phones");
    case "user":
    case "branch":
      return page("/settings");
    default:
      return null;
  }
}
