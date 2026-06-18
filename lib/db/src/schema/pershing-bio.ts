import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";
import { usersTable } from "./users";

const DEFAULT_BIO = `General John Joseph Pershing (1860–1948) was one of the most distinguished military commanders in American history. Born in Laclede, Missouri, he graduated from the United States Military Academy at West Point in 1886 and went on to serve in several of the Army's most consequential campaigns.

Pershing served in the American West during the closing years of the Indian Wars, fought in Cuba during the Spanish-American War of 1898, and led expeditionary forces in the Philippines and on the Mexican border during the punitive expedition of 1916.

His most consequential role came during World War I, when President Woodrow Wilson appointed him Commander of the American Expeditionary Forces (AEF). Pershing insisted that American forces fight as an independent army — a decision that preserved the distinct national identity of American military service on the Western Front. Under his command, more than two million American soldiers served in France, helping turn the tide of the war in favor of the Allied Powers.

In 1919, Congress awarded Pershing the rank of General of the Armies of the United States — the highest military grade ever conferred — a distinction shared only with George Washington, who received it posthumously. He later served as Army Chief of Staff and continued to advise the nation until his death on July 15, 1948.

Beyond his military career, John J. Pershing was a man of principle, discipline, and character — qualities long admired in both military and fraternal life.`;

const DEFAULT_LODGE_CONNECTION = `General John J. Pershing Lodge No. 307 was chartered in his honor, recognizing not only his extraordinary service to the United States, but also the values he embodied: integrity, duty, brotherhood, and an unwavering commitment to those he led.

The Lodge was established within the military community, and naming it after General Pershing was a fitting tribute to a commander who defined American military service in the twentieth century. The choice reflects the Lodge's heritage as a brotherhood of men who served their country and their community with honor.

His legacy endures not only in the annals of American military history, but in the spirit of every Brother who meets, acts, and parts as a Mason under the name of General John J. Pershing Lodge No. 307.`;

export const pershingBioTable = pgTable("pershing_bio", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  biographyText: text("biography_text").notNull().default(DEFAULT_BIO),
  lodgeConnectionText: text("lodge_connection_text").notNull().default(DEFAULT_LODGE_CONNECTION),
  updatedBy: text("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_pershing_bio_lodge").on(t.lodgeId),
]);

export type PershingBio = typeof pershingBioTable.$inferSelect;
export type InsertPershingBio = typeof pershingBioTable.$inferInsert;
