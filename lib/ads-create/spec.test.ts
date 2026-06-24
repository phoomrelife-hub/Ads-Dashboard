import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OBJECTIVES,
  optimizationGoalsFor,
  billingEventFor,
  validateBudgetFloor,
  normalizeFbError,
} from "./spec";

test("OBJECTIVES covers all four asked-for objectives", () => {
  const values = OBJECTIVES.map((o) => o.value);
  assert.ok(values.includes("OUTCOME_LEADS"));
  assert.ok(values.includes("OUTCOME_SALES"));
  assert.ok(values.includes("OUTCOME_TRAFFIC"));
  assert.ok(values.includes("OUTCOME_ENGAGEMENT") || values.includes("OUTCOME_AWARENESS"));
});

test("optimizationGoalsFor returns lead goals for OUTCOME_LEADS", () => {
  const goals = optimizationGoalsFor("OUTCOME_LEADS");
  assert.ok(goals.includes("LEAD_GENERATION") || goals.includes("OFFSITE_CONVERSIONS"));
  assert.ok(goals.length > 0);
});

test("optimizationGoalsFor returns conversion goal for OUTCOME_SALES", () => {
  assert.ok(optimizationGoalsFor("OUTCOME_SALES").includes("OFFSITE_CONVERSIONS"));
});

test("billingEventFor maps a known goal to a valid billing event", () => {
  assert.equal(typeof billingEventFor("LINK_CLICKS"), "string");
  assert.ok(billingEventFor("LINK_CLICKS").length > 0);
});

test("validateBudgetFloor rejects below minimum and accepts above", () => {
  assert.notEqual(validateBudgetFloor(0.1, "USD"), null);
  assert.equal(validateBudgetFloor(50, "USD"), null);
});

test("normalizeFbError extracts error_user_msg when present", () => {
  const e = new Error("Graph fail");
  (e as unknown as Record<string, unknown>).fbError = { message: "raw", error_user_msg: "Budget too low", error_subcode: 1487293 };
  const out = normalizeFbError(e);
  assert.equal(out.message, "Budget too low");
});

test("normalizeFbError falls back to message string", () => {
  assert.equal(normalizeFbError(new Error("boom")).message, "boom");
});
