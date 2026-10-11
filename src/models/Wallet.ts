import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { PACKAGE_KINDS, OPERATORS, WALLET_KINDS, WALLET_PROVIDERS, WALLET_TXN_TYPES } from "@/lib/constants";

/**
 * A balance the shop keeps with a provider: an Easyload / packages SIM, a JazzCash or Easypaisa
 * retailer account, or a bank account. `balance` is the float, changed only by transactions.
 */
const WalletSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: WALLET_KINDS, required: true },
    provider: { type: String, enum: WALLET_PROVIDERS, required: true },
    /** SIM / account number. */
    number: { type: String, trim: true },
    branch: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    balance: { type: Number, default: 0 },
    /** Warn when the balance falls below this. */
    lowAlert: { type: Number, default: 0, min: 0 },
    /** Commission earned on Easyload / packages sold (% of the amount), when paid per sale. */
    commissionPct: { type: Number, default: 0, min: 0, max: 50 },
    /** Usual fee charged to the customer for cash in / out / bills (% of the amount, suggestion only). */
    feePct: { type: Number, default: 0, min: 0, max: 50 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
WalletSchema.plugin(tenantScoped);
WalletSchema.index({ tenant: 1, branch: 1, active: 1 });

export type WalletDoc = InferSchemaType<typeof WalletSchema>;
export const Wallet: Model<WalletDoc> = models.Wallet || model<WalletDoc>("Wallet", WalletSchema);

/** An internet / call / SMS package the shop sells (price list per network). */
const MobilePackageSchema = new Schema(
  {
    operator: { type: String, enum: OPERATORS, required: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: PACKAGE_KINDS, default: "internet" },
    data: { type: String, trim: true },
    minutes: { type: String, trim: true },
    sms: { type: String, trim: true },
    validityDays: { type: Number, min: 0 },
    /** What the customer pays. */
    price: { type: Number, required: true, min: 0 },
    /** Commission on this package (Rs); empty = the SIM's commission %. */
    commission: { type: Number, min: 0 },
    /** How to activate it (USSD code, app menu) — a note for the staff. */
    code: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
MobilePackageSchema.plugin(tenantScoped);
MobilePackageSchema.index({ tenant: 1, operator: 1, active: 1, price: 1 });

export type MobilePackageDoc = InferSchemaType<typeof MobilePackageSchema>;
export const MobilePackage: Model<MobilePackageDoc> = models.MobilePackage || model<MobilePackageDoc>("MobilePackage", MobilePackageSchema);

/**
 * One Easyload / package / cash-in / cash-out / bill / top-up… entry. `walletEffect` is the change
 * to the wallet balance and `cashEffect` the change to the cash drawer (both signed); profit = fee +
 * commission. A wrong entry is cancelled with a "reversal" entry that undoes both.
 */
const WalletTxnSchema = new Schema(
  {
    txnNo: { type: String, required: true },
    branch: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    wallet: { type: Schema.Types.ObjectId, ref: "Wallet", required: true },
    walletName: { type: String },
    type: { type: String, enum: WALLET_TXN_TYPES, required: true },
    amount: { type: Number, required: true, min: 0 },
    fee: { type: Number, default: 0 },
    commission: { type: Number, default: 0 },
    walletEffect: { type: Number, required: true },
    cashEffect: { type: Number, required: true },
    /** How the customer paid / was paid (cash = drawer). */
    method: { type: String, enum: ["cash", "bank", "other"], default: "cash" },
    balanceAfter: { type: Number },
    customerNumber: { type: String, trim: true },
    customerName: { type: String, trim: true },
    package: { type: Schema.Types.ObjectId, ref: "MobilePackage" },
    packageName: { type: String },
    operator: { type: String },
    /** Provider's transaction ID. */
    ref: { type: String, trim: true },
    note: { type: String, trim: true },
    reversed: { type: Boolean, default: false },
    /** On a reversal: the entry it cancels. */
    reverses: { type: Schema.Types.ObjectId, ref: "WalletTxn" },
    reverseReason: { type: String, trim: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
  },
  { timestamps: true },
);
WalletTxnSchema.plugin(tenantScoped);
WalletTxnSchema.index({ tenant: 1, txnNo: 1 }, { unique: true });
WalletTxnSchema.index({ tenant: 1, branch: 1, createdAt: -1 });
WalletTxnSchema.index({ tenant: 1, wallet: 1, createdAt: -1 });

export type WalletTxnDoc = InferSchemaType<typeof WalletTxnSchema>;
export const WalletTxn: Model<WalletTxnDoc> = models.WalletTxn || model<WalletTxnDoc>("WalletTxn", WalletTxnSchema);
