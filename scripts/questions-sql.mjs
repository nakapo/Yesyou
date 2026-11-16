import { readFileSync, writeFileSync } from "node:fs";
const questions = JSON.parse(
  readFileSync(new URL("../src/questions.json", import.meta.url), "utf8"),
);
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
if (new Set(questions.map((q) => q.id)).size !== questions.length)
  throw Error("Duplicate question IDs");
const sql =
  "begin;\nupdate private.questions set active=false where id not in (" +
  questions.map((q) => q.id).join(",") +
  ");\ninsert into private.questions(id,category,text,spice,active) values\n" +
  questions
    .map(
      (q) => `(${q.id},${quote(q.category)},${quote(q.text)},${q.spice},true)`,
    )
    .join(",\n") +
  "\non conflict(id) do update set category=excluded.category,text=excluded.text,spice=excluded.spice,active=true;\ncommit;\n";
writeFileSync(
  new URL("../supabase/questions-upsert.sql", import.meta.url),
  sql,
);
console.log(
  "Generated supabase/questions-upsert.sql — run in Supabase SQL Editor after editing questions.json",
);
