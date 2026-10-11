import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { PTA_STATUS } from "@/lib/constants";

/**
 * A used phone bought from a walk-in customer. Keeps who sold it (name, CNIC, phone, photos) and
 * the phone's condition, so the shop has a record if the phone turns out to be stolen. The phone
 * itself goes into stock as a Device for resale.
 */
const UsedPurchaseSchema = new Schema(
  {
    buyNo: { type: String, required: true },
    branch: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    branchName: { type: String },
    seller: {
      type: new Schema(
        {
          name: { type: String, required: true, trim: true },
          cnic: { type: String, required: true, trim: true },
          phone: { type: String, required: true, trim: true },
          address: { type: String, trim: true },
          /** Customer khata (when the money was put in their khata, e.g. trade-in). */
          party: { type: Schema.Types.ObjectId, ref: "Party" },
        },
        { _id: false },
      ),
      required: true,
    },
    /** Photos of the seller / CNIC / phone (small JPEGs as data URLs). */
    photos: { type: [String], default: undefined },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    device: { type: Schema.Types.ObjectId, ref: "Device" },
    imei: { type: String, required: true },
    imei2: { type: String },
    color: { type: String, trim: true },
    storage: { type: String, trim: true },
    pta: { type: String, enum: PTA_STATUS, default: "unknown" },
    /** Condition checklist: each item ok / not ok; battery health in %. */
    checks: { type: Schema.Types.Mixed },
    batteryHealth: { type: Number, min: 0, max: 100 },
    accessories: { type: [String], default: undefined },
    notes: { type: String, trim: true },
    /** Paid to the seller. */
    price: { type: Number, required: true, min: 0 },
    /** Price it will be sold at (the phone's own price). */
    askingPrice: { type: Number, min: 0 },
    method: { type: String, enum: ["cash", "jazzcash", "easypaisa", "bank", "khata"], default: "cash" },
    paymentRef: { type: String, trim: true },
    status: { type: String, enum: ["completed", "cancelled"], default: "completed" },
    cancelledAt: { type: Date },
    cancelledByName: { type: String },
    cancelReason: { type: String, trim: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
  },
  { timestamps: true },
);

UsedPurchaseSchema.plugin(tenantScoped);
UsedPurchaseSchema.index({ tenant: 1, buyNo: 1 }, { unique: true });
UsedPurchaseSchema.index({ tenant: 1, createdAt: -1 });
UsedPurchaseSchema.index({ tenant: 1, imei: 1 });
UsedPurchaseSchema.index({ tenant: 1, "seller.cnic": 1 });

export type UsedPurchaseDoc = InferSchemaType<typeof UsedPurchaseSchema>;
export const UsedPurchase: Model<UsedPurchaseDoc> = models.UsedPurchase || model<UsedPurchaseDoc>("UsedPurchase", UsedPurchaseSchema);
