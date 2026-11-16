#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker run --name yesyou-test-db -e POSTGRES_PASSWORD=disposable-local-test -d postgres:17 >/dev/null
trap 'docker rm -f yesyou-test-db >/dev/null' EXIT
for attempt in {1..30}; do
  if docker exec yesyou-test-db pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec -i yesyou-test-db psql -q -U postgres -v ON_ERROR_STOP=1 <<'SQL'
create role anon;
create role authenticated;
create schema auth;
create schema extensions;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create publication supabase_realtime;
SQL
docker exec -i yesyou-test-db psql -q -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/202611170001_game.sql
docker exec -i yesyou-test-db psql -q -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/202611170002_questions.sql
docker exec -i yesyou-test-db psql -q -U postgres -v ON_ERROR_STOP=1 < tests/question-upgrade-before.sql
docker exec -i yesyou-test-db psql -q -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/202611170003_import_user_questions.sql
docker exec -i yesyou-test-db psql -q -U postgres -v ON_ERROR_STOP=1 < tests/question-upgrade-after.sql
docker exec -i yesyou-test-db psql -q -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/202611170004_party_flow.sql
python3 tests/database.py
python3 tests/party_database.py
