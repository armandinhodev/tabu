/** @vitest-environment node */
import mongoose from "mongoose";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminSettingsModel } from "../models/AdminModels";
import { MongoAdminSettingsStore } from "./MongoAdminSettingsStore";

const previousReadyState = mongoose.connection.readyState;
const connection = mongoose.connection as unknown as { readyState: number };
beforeEach(() => {
  connection.readyState = 1;
});
afterEach(() => {
  vi.restoreAllMocks();
  connection.readyState = previousReadyState;
});

it("defaults to Flash without writing and reads the shared persisted selection", async () => {
  const read = vi
    .spyOn(AdminSettingsModel, "findById")
    .mockReturnValue({ lean: () => ({ exec: async () => null }) } as never);
  expect(await new MongoAdminSettingsStore().get()).toEqual({ model: "deepseek-flash" });
  read.mockReturnValue({
    lean: () => ({ exec: async () => ({ model: "deepseek-v4-pro" }) }),
  } as never);
  expect(await new MongoAdminSettingsStore().get()).toEqual({ model: "deepseek-v4-pro" });
});

it("upserts only the global model with schema validators enabled", async () => {
  const update = vi.spyOn(AdminSettingsModel, "findOneAndUpdate").mockReturnValue({
    lean: () => ({ exec: async () => ({ model: "deepseek-v4-pro" }) }),
  } as never);
  expect(await new MongoAdminSettingsStore().set({ model: "deepseek-v4-pro" })).toEqual({
    model: "deepseek-v4-pro",
  });
  expect(update).toHaveBeenCalledWith(
    { _id: "global" },
    { $set: { model: "deepseek-v4-pro" } },
    { upsert: true, new: true, runValidators: true },
  );
});
