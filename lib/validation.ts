import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

export const deviceCreateSchema = z.object({
  name: z.string().trim().min(1, "Device name is required").max(100),
  type: z.enum(["laptop", "phone", "tablet", "other"]),
});

export const locationReportSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().optional(),
  source: z.enum(["gps", "ip"]).default("gps"),
});
