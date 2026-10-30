import { Schema } from "mongoose";
import { DEEPSEEK_MODELS, type DeepSeekModel } from "../../../../application/admin/settings";

export interface AdminSettingsDocument {
  _id: string;
  model: DeepSeekModel;
}

export const adminSettingsSchema = new Schema<AdminSettingsDocument>(
  {
    _id: { type: String, required: true, enum: ["global"] },
    model: { type: String, required: true, enum: DEEPSEEK_MODELS },
  },
  { collection: "adminSettings", versionKey: false },
);
