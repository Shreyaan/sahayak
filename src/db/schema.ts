import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, vector } from "drizzle-orm/pg-core";
import type { WorkflowDefinition } from "@/lib/workflow";
import type { CaseSnapshot } from "@/lib/workflow";
import type { CitizenOutcomeKind } from "@/lib/citizen-outcomes";
import type { TrustMetadata } from "@/lib/trust";
import type { ReviewRevisionContent } from "@/lib/review-case";

export const workflowsTable = pgTable("workflows", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workflowVersionsTable = pgTable("workflow_versions", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id").notNull().references(() => workflowsTable.id),
  version: integer("version").notNull(),
  status: text("status", { enum: ["draft", "published"] }).notNull(),
  scope: text("scope", { enum: ["central", "state", "district"] }).notNull(),
  stateCode: text("state_code"),
  districtCode: text("district_code"),
  definition: jsonb("definition").$type<WorkflowDefinition>().notNull(),
  trust: jsonb("trust").$type<TrustMetadata>().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("workflow_versions_workflow_version_idx").on(table.workflowId, table.version),
  index("workflow_versions_publication_idx").on(table.status, table.scope),
]);

export const searchDocumentsTable = pgTable("search_documents", {
  id: text("id").primaryKey(),
  workflowVersionId: text("workflow_version_id").notNull()
    .references(() => workflowVersionsTable.id),
  locale: text("locale", { enum: ["hi", "en"] }).notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  searchText: text("search_text").notNull(),
  embedding: vector("embedding", { dimensions: 1024 }),
}, (table) => [
  uniqueIndex("search_documents_version_locale_idx").on(table.workflowVersionId, table.locale),
]);

export const citizenCasesTable = pgTable("citizen_cases", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id").notNull(),
  ownerHash: text("owner_hash"),
  snapshot: jsonb("snapshot").$type<CaseSnapshot>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const citizenOutcomesTable = pgTable("citizen_outcomes", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => citizenCasesTable.id, { onDelete: "restrict" }),
  workflowVersionId: text("workflow_version_id").notNull().references(() => workflowVersionsTable.id),
  stepId: text("step_id"),
  kind: text("kind").$type<CitizenOutcomeKind>().notNull(),
  detail: text("detail"),
  scope: text("scope", { enum: ["central", "state", "district"] }).notNull(),
  stateCode: text("state_code"),
  districtCode: text("district_code"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("citizen_outcomes_case_time_idx").on(table.caseId, table.occurredAt),
  index("citizen_outcomes_kind_time_idx").on(table.kind, table.occurredAt),
]);

export const contributorSubmissionsTable = pgTable("contributor_submissions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  workflowId: text("workflow_id").notNull(),
  input: text("input").notNull(),
  draft: jsonb("draft").notNull(),
});

export const legacyWorkflowDefinitionsTable = pgTable("legacy_workflow_definitions", {
  id: text("id").primaryKey(),
  definition: jsonb("definition").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviewCasesTable = pgTable("review_cases", {
  id: text("id").primaryKey(),
  sourceChannel: text("source_channel", { enum: ["contributor", "mcp"] }).notNull(),
  status: text("status", { enum: ["draft", "published", "rejected"] }).notNull(),
  scope: text("scope", { enum: ["central", "state", "district"] }).notNull(),
  stateCode: text("state_code"),
  districtCode: text("district_code"),
  submittedTitle: text("submitted_title"),
  evidence: text("evidence").notNull(),
  baselineWorkflowVersionId: text("baseline_workflow_version_id").references(() => workflowVersionsTable.id),
  currentRevisionId: text("current_revision_id").notNull(),
  currentRevisionHash: text("current_revision_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("review_cases_queue_idx").on(table.status, table.scope, table.updatedAt),
]);

export const reviewRevisionsTable = pgTable("review_revisions", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => reviewCasesTable.id, { onDelete: "restrict" }),
  revision: integer("revision").notNull(),
  contentHash: text("content_hash").notNull(),
  content: jsonb("content").$type<ReviewRevisionContent>().notNull(),
  editorId: text("editor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("review_revisions_case_revision_idx").on(table.caseId, table.revision),
  uniqueIndex("review_revisions_content_hash_idx").on(table.caseId, table.contentHash),
]);
