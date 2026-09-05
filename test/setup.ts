import { GlobalRegistrator } from "@happy-dom/global-registrator";

process.env.DATABASE_URL ??= "postgresql:///sahayak_test";
process.env.BETTER_AUTH_SECRET ??= "test-contribution-preview-secret";

GlobalRegistrator.register();
