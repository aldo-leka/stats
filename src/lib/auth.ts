import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

const dbPath = process.env.NODE_ENV === "production"
  ? "/app/data/auth.sqlite"
  : "./auth.sqlite";

export const auth = betterAuth({
  database: new Database(dbPath),
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  trustedOrigins: [process.env.NEXT_PUBLIC_APP_URL as string],
});
