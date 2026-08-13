import { eq } from "drizzle-orm";
import { classes } from "@/db/schema";

type Db = typeof import("@/db").db;
type Tx = Parameters<Db["transaction"]>[0] extends (tx: infer T) => unknown
  ? T
  : never;
type Database = Db | Tx;

export async function cancelClass(db: Database, classId: number) {
  return db
    .update(classes)
    .set({ cancelled: true })
    .where(eq(classes.id, classId))
    .returning()
    .get();
}
