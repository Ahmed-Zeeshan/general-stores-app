import { Schema } from "mongoose";

const GUARDED_QUERIES = [
  "find",
  "findOne",
  "countDocuments",
  "findOneAndUpdate",
  "findOneAndDelete",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
] as const;

/**
 * Adds a required `tenant` field and refuses any query or aggregation that does not filter by
 * tenant. This makes it impossible to accidentally read or change another shop's data.
 */
export function tenantScoped(schema: Schema) {
  schema.add({ tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true } });

  for (const op of GUARDED_QUERIES) {
    schema.pre(op, function () {
      if (!this.getFilter().tenant) {
        throw new Error(`Tenant filter missing on ${this.model.modelName}.${op}()`);
      }
    });
  }

  schema.pre("aggregate", function () {
    const first = this.pipeline()[0] as { $match?: { tenant?: unknown } } | undefined;
    if (!first?.$match?.tenant) {
      throw new Error("Tenant $match must be the first stage of every aggregation");
    }
  });
}
