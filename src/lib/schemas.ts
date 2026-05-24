import { z } from "zod";

export const ReserveSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  warehouseId: z.string().min(1, "warehouseId is required"),
  quantity: z.number().int().positive("quantity must be a positive integer"),
});

export const IdParamSchema = z.object({
  id: z.string().min(1, "id is required"),
});

export type ReserveInput = z.infer<typeof ReserveSchema>;
