import {
  pgTable,
  uuid,
  text,
  timestamp,
  doublePrecision,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

export const deviceTypeEnum = pgEnum("device_type", [
  "laptop",
  "phone",
  "tablet",
  "other",
]);

export const locationSourceEnum = pgEnum("location_source", ["gps", "ip"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // Hash of an account-level enrollment token used by the "add a Windows PC via
  // PowerShell" flow. Reusable across PCs; regenerating it invalidates the old.
  enrollmentTokenHash: text("enrollment_token_hash"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: deviceTypeEnum("type").notNull().default("other"),
  deviceSecretHash: text("device_secret_hash").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    accuracyMeters: doublePrecision("accuracy_meters"),
    source: locationSourceEnum("source").notNull().default("gps"),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("locations_device_captured_idx").on(table.deviceId, table.capturedAt)],
);

export const pingRequests = pgTable("ping_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: uuid("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),
  requestedBy: uuid("requested_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  requestedAt: timestamp("requested_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
});
