import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

const BRANDS = {
  yanhee: [
    "1009471678912576","761879697002676","576966688835369",
  ],
  bioactive: [
    "796395763564984","102677399398975","716673838206298",
    "1009286908923937","945678795296557","914781158393714",
    "100314123037279","109424785448593","627470817127291",
    "984173478105679","1000937386427885","940379315830705",
    "961922937001161","1051257084735656","882218364985816","922183924315770",
  ],
  hopeful: [
    "992375017294431","1052728847928956","931296696743032",
    "1065862346600791","951923971345251","1002478362949057",
    "769718802893628","905776652609110","931855656668305",
    "1172783582581920","1012770168588916",
  ],
};

const allPageIds = Object.values(BRANDS).flat();
const { data, error } = await supabase
  .from("fb_pages")
  .select("id, account_id, name")
  .in("id", allPageIds);

if (error) { console.error("Supabase error:", error.message); process.exit(1); }

console.log(`\nFound ${data.length} / ${allPageIds.length} brand pages in fb_pages\n`);

for (const [brand, pageIds] of Object.entries(BRANDS)) {
  const found   = data.filter(r => pageIds.includes(r.id));
  const missing = pageIds.filter(id => !data.find(r => r.id === id));
  const accts   = [...new Set(found.map(r => r.account_id))];
  console.log(`── ${brand.toUpperCase()} (${found.length}/${pageIds.length} pages) ──`);
  for (const r of found) console.log(`  ✓  ${r.name.padEnd(45)} ${r.id}  [${r.account_id}]`);
  for (const id of missing) console.log(`  ✗  (not in cache)                              ${id}`);
  if (accts.length) console.log(`  → accounts: ${accts.join(", ")}`);
  console.log();
}
