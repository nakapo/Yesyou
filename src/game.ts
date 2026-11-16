export type State =
  | "LOBBY"
  | "PREPARING"
  | "GUESSING"
  | "READY_TO_REVEAL"
  | "REVEALED"
  | "FINISHED";
export type Player = {
  id: string;
  name: string;
  avatar: number;
  seat: number;
  joined: number;
  score: number;
  online: boolean;
};
export type Vote = {
  player: string;
  answered: boolean;
  excluded: boolean;
  answer: boolean | null;
};
export type Game = {
  version: number;
  id: string;
  code: string;
  name: string;
  host: string;
  state: State;
  round: number;
  owner: string | null;
  me: string;
  spicy: boolean;
  admitting: boolean;
  queue: string[];
  revealed: number;
  answer: boolean | null;
  question: string | null;
  players: Player[];
  votes: Vote[];
};
export function ranked(players: Player[]) {
  return [...players]
    .sort((a, b) => b.score - a.score || a.joined - b.joined)
    .map((p, _, all) => ({
      ...p,
      rank: 1 + all.filter((x) => x.score > p.score).length,
    }));
}
export function demoGame(): Game {
  return {
    id: "demo",
    version: 0,
    code: "pizza-demo",
    name: "วงเพื่อนตัวดี",
    host: "1",
    state: "LOBBY",
    round: 0,
    owner: null,
    me: "1",
    spicy: false,
    admitting: false,
    queue: [],
    revealed: 0,
    answer: null,
    question: null,
    players: ["คุณ", "มะปราง", "ต้น", "พลอย"].map((name, i) => ({
      id: String(i + 1),
      name,
      avatar: i,
      seat: i + 1,
      joined: i,
      score: 0,
      online: true,
    })),
    votes: [],
  };
}
