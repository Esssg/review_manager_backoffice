import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

function resolveEnv(nameA, nameB) {
  return process.env[nameA] || process.env[nameB];
}

function normalizeSupabaseUrl(url) {
  if (!url) return url;
  return url.replace(/\/rest\/v1\/?$/, "");
}

const supabaseUrl = normalizeSupabaseUrl(
  resolveEnv("SUPABASE_URL", "VITE_SUPABASE_URL")
);
const supabaseAnonKey = resolveEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    [
      "Supabase env 값이 없습니다.",
      "필수:",
      "- SUPABASE_URL 또는 VITE_SUPABASE_URL",
      "- SUPABASE_ANON_KEY 또는 VITE_SUPABASE_ANON_KEY"
    ].join("\n")
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const connectionCheckTable = "products";
  const res = await supabase.from(connectionCheckTable).select("id", { head: true });

  if (!res.error) {
    console.log(`Supabase 연결 성공 (table: ${connectionCheckTable})`);
    process.exit(0);
  }

  console.error(
    `Supabase 연결 실패 (table: ${connectionCheckTable}). URL/KEY 또는 허용된 DB 테이블을 확인하세요.`
  );
  process.exit(1);
}

run();
