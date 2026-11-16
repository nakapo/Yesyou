import { readFileSync, writeFileSync } from "node:fs";
const questions = JSON.parse(
  readFileSync(new URL("../src/questions.json", import.meta.url), "utf8"),
);
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
if (new Set(questions.map((q) => q.id)).size !== questions.length)
  throw Error("Duplicate question IDs");
const sql =
  "insert into private.questions(id,category,text,spice) values\n" +
  questions
    .map((q) => `(${q.id},${quote(q.category)},${quote(q.text)},${q.spice})`)
    .join(",\n") +
  "\non conflict(id) do update set category=excluded.category,text=excluded.text,spice=excluded.spice;\n";
writeFileSync(
  new URL("../supabase/questions-upsert.sql", import.meta.url),
  sql,
);
console.log(
  "Generated supabase/questions-upsert.sql — run in Supabase SQL Editor after editing questions.json",
);
