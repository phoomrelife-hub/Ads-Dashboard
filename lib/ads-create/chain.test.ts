import { test } from "node:test";
import assert from "node:assert/strict";
import { createCampaignChain, type CampaignDraft, type ChainDeps } from "./chain";

const draft: CampaignDraft = {
  name: "Test",
  objective: "OUTCOME_TRAFFIC",
  specialAdCategories: [],
  dailyBudgetMajor: 50,
  currency: "USD",
  optimizationGoal: "LINK_CLICKS",
  targeting: { geo_locations: { countries: ["US"] } },
  creative: { mode: "existing_creative", creativeId: "111" },
};

function depsThatSucceed(calls: string[]): ChainDeps {
  return {
    createCampaign: async () => { calls.push("campaign"); return { id: "c1" }; },
    createAdSet: async () => { calls.push("adset"); return { id: "as1" }; },
    createCreative: async () => { calls.push("creative"); return { id: "cr1" }; },
    createAd: async () => { calls.push("ad"); return { id: "ad1" }; },
    del: async (id: string) => { calls.push("del:" + id); },
  };
}

test("happy path returns campaignId and creates nothing extra", async () => {
  const calls: string[] = [];
  const res = await createCampaignChain("act_1", draft, depsThatSucceed(calls));
  assert.deepEqual(res, { ok: true, campaignId: "c1" });
  assert.deepEqual(calls, ["campaign", "adset", "creative", "ad"]);
});

test("failure at creative deletes adset then campaign in reverse order", async () => {
  const calls: string[] = [];
  const deps = depsThatSucceed(calls);
  deps.createCreative = async () => { calls.push("creative"); throw Object.assign(new Error("bad creative"), { fbError: { error_user_msg: "Bad creative" } }); };
  const res = await createCampaignChain("act_1", draft, deps);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message, "Bad creative");
  // created campaign + adset, then rolled back adset (as1) before campaign (c1)
  assert.deepEqual(calls, ["campaign", "adset", "creative", "del:as1", "del:c1"]);
});

test("failure at first step rolls back nothing", async () => {
  const calls: string[] = [];
  const deps = depsThatSucceed(calls);
  deps.createCampaign = async () => { calls.push("campaign"); throw new Error("nope"); };
  const res = await createCampaignChain("act_1", draft, deps);
  assert.equal(res.ok, false);
  assert.deepEqual(calls, ["campaign"]);
});
