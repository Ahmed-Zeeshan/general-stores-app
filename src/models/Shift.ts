import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Cash put into or taken out of the drawer during a shift (not sales), e.g. change float, bank deposit. */
const DrawerMovementSchema = new Schema(
  {
    kind: { type: String, enum: ["in", "out"], required: true },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, trim: true },
    at: { type: Date, default: Date.now },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
  },
  { _id: false },
);

/**
 * A cash-drawer session for one branch: opened with a counted float, closed by counting the cash.
 * At close the expected cash and the full day summary (Z report) are saved and never change.
 */
const ShiftSchema = new Schema(
  {
    shiftNo: { type: String, required: true },
    branch: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    branchName: { type: String },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    openedAt: { type: Date, default: Date.now },
    openedBy: { type: Schema.Types.ObjectId, ref: "User" },
    openedByName: { type: String },
    openingCash: { type: Number, required: true, min: 0 },
    openNote: { type: String, trim: true },
    movements: { type: [DrawerMovementSchema], default: [] },
    /** Mid-day handovers between cashiers: who counted the drawer and when. Variance still settles at the day close. */
    handovers: {
      type: [
        {
          _id: false,
          at: { type: Date, default: Date.now },
          byName: String,
          toName: String,
          counted: Number,
          expected: Number,
          difference: Number,
          note: String,
        },
      ],
      default: undefined,
    },
    closedAt: { type: Date },
    closedBy: { type: Schema.Types.ObjectId, ref: "User" },
    closedByName: { type: String },
    /** Notes and coins counted at close, e.g. [{ value: 1000, count: 4 }]; value 0 = loose coins total. */
    denominations: { type: [{ value: Number, count: Number, _id: false }], default: undefined },
    countedCash: { type: Number },
    expectedCash: { type: Number },
    difference: { type: Number },
    closeNote: { type: String, trim: true },
    /** Cash left in the drawer for the next day (the float); the rest was taken out at close. */
    floatLeft: { type: Number },
    removedAtClose: { type: Number },
    /** The float the last close left; set when it differs from the cash counted at opening. */
    expectedOpening: { type: Number },
    openingDifference: { type: Number },
    /** Bills / refunds made offline during this session that arrived after it was closed. */
    late: {
      type: [
        {
          _id: false,
          kind: { type: String, enum: ["sale", "return"] },
          ref: { type: Schema.Types.ObjectId },
          no: String,
          at: Date,
          total: Number,
          cash: Number,
          arrivedAt: { type: Date, default: Date.now },
        },
      ],
      default: undefined,
    },
    summary: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

ShiftSchema.plugin(tenantScoped);

ShiftSchema.index({ tenant: 1, shiftNo: 1 }, { unique: true });
ShiftSchema.index({ tenant: 1, openedAt: -1 });
// Only one open drawer per branch.
ShiftSchema.index({ tenant: 1, branch: 1 }, { unique: true, partialFilterExpression: { status: "open" } });

export type ShiftDoc = InferSchemaType<typeof ShiftSchema>;
export const Shift: Model<ShiftDoc> = models.Shift || model<ShiftDoc>("Shift", ShiftSchema);
