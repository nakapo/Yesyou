// After migration 004: node --env-file=.env tests/online-party.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
const clients = Array.from({ length: 3 }, () =>
  createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ),
);
let room;
async function rpc(i, name, args) {
  const { data, error } = await clients[i].rpc(name, args);
  if (error) throw error;
  return data;
}
const view = (i) => rpc(i, "game_view", { p_room: room });
const act = (i, a, v = {}) =>
  rpc(i, "game_action", { p_room: room, p_action: a, p_value: v });
try {
  for (const c of clients) {
    const { error } = await c.auth.signInAnonymously();
    if (error) throw error;
  }
  room = await rpc(0, "game_join", {
    p_name: "Party host",
    p_room_name: "Party upgrade test",
    p_avatar: 19,
  });
  const code = (await view(0)).code;
  assert.match(code, /^[a-z]+$/);
  for (let i = 1; i < 3; i++)
    await rpc(i, "game_join", {
      p_code: code,
      p_name: "Friend " + i,
      p_avatar: i + 8,
    });
  await act(0, "start");
  await act(0, "open");
  await act(1, "vote", { answer: true });
  await act(2, "vote", { answer: false });
  await act(0, "reveal", { answer: true });
  const preview = await view(1);
  assert.equal(preview.state, "PREPARING");
  assert.equal(preview.preparing_next, true);
  assert.ok(preview.question);
  assert.equal(preview.round, 2);
  assert.equal((await view(2)).state, "REVEALED");
  const old = preview.question;
  await act(1, "reroll");
  assert.notEqual((await view(1)).question, old);
  await act(1, "open");
  assert.equal((await view(0)).state, "GUESSING");
  assert.equal((await view(0)).question, null);
  await assert.rejects(act(1, "reveal", { answer: true }));
  await act(0, "vote", { answer: true });
  await act(2, "vote", { answer: true });
  await act(1, "reveal", { answer: true });
  assert.equal(
    (await view(0)).players.reduce((s, p) => s + p.score, 0),
    3,
  );
  await act(0, "finish");
  console.log(
    "PASS: food-only code, new avatars, automatic private preparation, reroll, open next turn, privacy, score. Room:",
    code,
  );
} finally {
  await Promise.all(clients.map((c) => c.removeAllChannels()));
}
