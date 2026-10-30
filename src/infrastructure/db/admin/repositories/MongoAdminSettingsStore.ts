import {
  DEFAULT_DEEPSEEK_MODEL,
  DEEPSEEK_MODELS,
  type AdminSettings,
  type AdminSettingsStore,
} from "../../../../application/admin/settings";
import { adminUnavailable } from "../../../../application/admin/errors";
import { assertMongoAvailable } from "../mongo-available";
import { AdminSettingsModel } from "../models/AdminModels";

function settings(document: { model: string } | null): AdminSettings {
  if (document === null) return { model: DEFAULT_DEEPSEEK_MODEL };
  if (!DEEPSEEK_MODELS.includes(document.model as AdminSettings["model"])) {
    throw adminUnavailable("invalid_settings", "Stored model configuration is invalid");
  }
  return { model: document.model as AdminSettings["model"] };
}

export class MongoAdminSettingsStore implements AdminSettingsStore {
  async get(): Promise<AdminSettings> {
    assertMongoAvailable();
    return settings(await AdminSettingsModel.findById("global").lean().exec());
  }

  async set(input: AdminSettings): Promise<AdminSettings> {
    assertMongoAvailable();
    const document = await AdminSettingsModel.findOneAndUpdate(
      { _id: "global" },
      { $set: { model: input.model } },
      { upsert: true, new: true, runValidators: true },
    )
      .lean()
      .exec();
    if (document === null)
      throw adminUnavailable("settings_unavailable", "Could not save model configuration");
    return settings(document);
  }
}
