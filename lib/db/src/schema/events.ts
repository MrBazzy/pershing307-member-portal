import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";
import { usersTable } from "./users";
import { eventCategoriesTable } from "./event-categories";

export const eventsTable = pgTable("events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  title: text("title").notNull(),
  description: text("description"),
  date: text("date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  categoryId: text("category_id").references(() => eventCategoriesTable.id),
  visibility: text("visibility").notNull().default("members"),
  organizerId: text("organizer_id").references(() => usersTable.id),
  location: text("location"),
  createdBy: text("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_events_lodge").on(t.lodgeId),
  index("idx_events_date").on(t.date),
  index("idx_events_visibility").on(t.visibility),
]);

export type Event = typeof eventsTable.$inferSelect;
export type InsertEvent = typeof eventsTable.$inferInsert;
