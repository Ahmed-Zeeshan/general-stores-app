import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { DEVICE_CONDITIONS, PTA_STATUS } from "@/lib/constants";

/** One step in a phone's life: bought, sold, returned, moved, removed… */
const DeviceEventSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    action: { type: String, required: true },
    refNo: { type: String },
    note: { type: String },
    userName: { type: String },
    /** Internal: groups the changes of one action, so a failed save can be undone. */
    op: { type: String },
  },
  { _id: false },
);

/**
 * One physical item with its own IMEI / serial number (a mobile phone). Products with
 * "track IMEI" keep their stock as these records: stock = how many are in stock.
 * A phone that is sold and later bought back gets a new record; searching an IMEI shows all of them.
 */
const DeviceSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    branch: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    imei: { type: String, required: true, trim: true },
    imei2: { type: String, trim: true },
    color: { type: String, trim: true },
    storage: { type: String, trim: true },
    condition: { type: String, enum: DEVICE_CONDITIONS, default: "new" },
    pta: { type: String, enum: PTA_STATUS, default: "unknown" },
    /** What the shop paid for this piece. */
    cost: { type: Number, default: 0, min: 0 },
    /** Asking price for this piece (used phones); empty = the product's sale price. */
    price: { type: Number, min: 0 },
    notes: { type: String, trim: true },
    status: { type: String, enum: ["in_stock", "sold", "returned", "removed"], default: "in_stock" },
    /** Where it came from. */
    source: {
      type: new Schema({ type: String, id: Schema.Types.ObjectId, refNo: String, name: String }, { _id: false }),
      default: undefined,
    },
    /** The sale (while sold). */
    sale: {
      type: new Schema(
        { id: Schema.Types.ObjectId, invoiceNo: String, customerName: String, at: Date, price: Number, warrantyUntil: Date },
        { _id: false },
      ),
      default: undefined,
    },
    history: { type: [DeviceEventSchema], default: [] },
  },
  { timestamps: true },
);

DeviceSchema.plugin(tenantScoped);

// The same IMEI can be in stock only once; old records (sold, returned) keep its history.
DeviceSchema.index({ tenant: 1, imei: 1 }, { unique: true, partialFilterExpression: { status: "in_stock" } });
DeviceSchema.index({ tenant: 1, imei: 1, createdAt: -1 });
DeviceSchema.index({ tenant: 1, imei2: 1 }, { sparse: true });
DeviceSchema.index({ tenant: 1, product: 1, branch: 1, status: 1 });
DeviceSchema.index({ tenant: 1, status: 1, createdAt: -1 });

export type DeviceDoc = InferSchemaType<typeof DeviceSchema>;
export const Device: Model<DeviceDoc> = models.Device || model<DeviceDoc>("Device", DeviceSchema);
