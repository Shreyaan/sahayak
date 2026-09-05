import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as authSchema from "./auth-schema";
import * as appSchema from "./schema";

const schema = { ...appSchema, ...authSchema };

let connection: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDatabase() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_UNAVAILABLE");

  if (!connection || !database) {
    connection = postgres(url, { max: 5, idle_timeout: 20 });
    database = drizzle(connection, { schema });
  }

  return database;
}
