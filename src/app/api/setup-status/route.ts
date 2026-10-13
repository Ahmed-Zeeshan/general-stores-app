import { handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { Device, Party, Product, Sale, Shift, Tenant, User, Wallet } from "@/models";

/** What a new shop has set up so far, for the "Get your shop ready" guide on the dashboard. */
export const GET = handle(async () => {
  const { tid } = await requireBranch(["owner"]);
  const tenant = (await Tenant.findById(tid).select("phone address modules setupDismissedAt shopType").lean()) as {
    phone?: string;
    address?: string;
    modules?: Record<string, boolean>;
    setupDismissedAt?: Date;
    shopType?: string;
  } | null;
  const m = tenant?.modules ?? {};
  const [products, customers, staff, shifts, bills, wallets, phones] = await Promise.all([
    Product.countDocuments({ tenant: tid, active: true }),
    Party.countDocuments({ tenant: tid, type: "customer" }),
    User.countDocuments({ tenant: tid }),
    Shift.countDocuments({ tenant: tid }),
    Sale.countDocuments({ tenant: tid }),
    m.wallets ? Wallet.countDocuments({ tenant: tid }) : 0,
    m.phones ? Device.countDocuments({ tenant: tid }) : 0,
  ]);
  return {
    dismissed: !!tenant?.setupDismissedAt,
    shopType: tenant?.shopType,
    modules: m,
    done: {
      shop: !!(tenant?.phone && tenant?.address),
      products: products >= 5,
      customers: customers >= 1,
      staff: staff >= 2,
      drawer: shifts >= 1,
      bill: bills >= 1,
      wallets: wallets >= 1,
      phones: phones >= 1,
    },
    counts: { products, customers, staff, bills },
  };
});

/** Hides the guide (the owner pressed "Hide"). */
export const POST = handle(async () => {
  const { tid } = await requireBranch(["owner"]);
  await Tenant.updateOne({ _id: tid }, { $set: { setupDismissedAt: new Date() } });
  return { ok: true };
});
