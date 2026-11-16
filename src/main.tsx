import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { QRCodeSVG } from "qrcode.react";
import { Avatar } from "./Avatar";
import { configured, identity, rpc, supabase } from "./api";
import { demoGame, ranked, type Game } from "./game";
import questions from "./questions.json";
import "./style.css";
function App() {
  const [page, setPage] = useState<"home" | "create" | "join">(
      location.search.includes("join") ? "join" : "home",
    ),
    [game, setGame] = useState<Game | null>(null),
    [demo, setDemo] = useState(false),
    [room, setRoom] = useState(localStorage.getItem("yesyou-room") || ""),
    [name, setName] = useState(""),
    [roomName, setRoomName] = useState(""),
    [code, setCode] = useState(""),
    [secret, setSecret] = useState(""),
    [avatar, setAvatar] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [choice, setChoice] = useState<boolean | null>(null),
    [scores, setScores] = useState(false),
    [connected, setConnected] = useState(navigator.onLine),
    [confirm, setConfirm] = useState<{
      text: string;
      action: () => void;
    } | null>(null),
    [copied, setCopied] = useState(false);
  const used = useRef<number[]>([]);
  const currentRoom = useRef(room);
  currentRoom.current = room;
  async function load(id: string) {
    const data = await rpc("game_view", { p_room: id });
    if (currentRoom.current === id) {
      setGame((previous) =>
        previous && previous.id === data.id && previous.version > data.version
          ? previous
          : data,
      );
      setConnected(true);
    }
  }
  useEffect(() => {
    if (!room || demo) return;
    let alive = true;
    const refresh = () => {
      if (alive)
        load(room).catch((e) => {
          setError(e.message);
          setConnected(false);
        });
    };
    identity()
      .then(refresh)
      .catch((e) => setError(e.message));
    const channel = supabase
      ?.channel("room-" + room)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "room_events",
          filter: "room=eq." + room,
        },
        refresh,
      )
      .subscribe();
    const timer = setInterval(() => {
      rpc("game_action", { p_room: room, p_action: "heartbeat" })
        .then(refresh)
        .catch(() => setConnected(false));
    }, 10000);
    const online = () => {
      setConnected(navigator.onLine);
      if (navigator.onLine) refresh();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    return () => {
      alive = false;
      clearInterval(timer);
      if (channel) supabase?.removeChannel(channel);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, [room, demo]);
  useEffect(() => {
    setChoice(null);
  }, [game?.round, game?.state, game?.me]);
  useEffect(() => {
    if (!confirm && !scores) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(
      confirm ? '[role="alertdialog"]' : '[role="dialog"]',
    );
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setConfirm(null);
        setScores(false);
      }
      if (event.key !== "Tab" || !dialog) return;
      const nodes = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),[href],input,select,[tabindex="0"]',
        ),
      );
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keys);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", keys);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [!!confirm, scores]);
  function draw(g: Game) {
    let pool = questions.filter(
      (q) => (g.spicy || !q.spice) && !used.current.includes(q.id),
    );
    if (!pool.length) {
      used.current = [];
      pool = questions.filter((q) => g.spicy || !q.spice);
    }
    const q = pool[Math.floor(Math.random() * pool.length)];
    used.current.push(q.id);
    g.question = q.text;
  }
  function demoAction(action: string, value: Record<string, unknown>) {
    if (!game) return;
    const g = structuredClone(game);
    g.version++;
    if (action === "spicy") g.spicy = !!value.enabled;
    if (action === "admit") g.admitting = !g.admitting;
    if (action === "start") {
      g.state = "PREPARING";
      g.round = 1;
      g.owner = g.players[0].id;
      g.queue = g.players.slice(1).map((p) => p.id);
      draw(g);
    }
    if (action === "reroll") draw(g);
    if (action === "open") {
      g.state = "GUESSING";
      g.votes = g.players
        .filter((p) => p.id !== g.owner)
        .map((p) => ({
          player: p.id,
          answered: false,
          excluded: false,
          answer: null,
        }));
    }
    if (action === "vote") {
      const v = g.votes.find((v) => v.player === g.me);
      if (v && !v.answered) {
        v.answered = true;
        v.answer = !!value.answer;
      }
    }
    if (action === "exclude") {
      const v = g.votes.find((v) => v.player === value.player);
      if (v && !v.answered) v.excluded = true;
    }
    if (action === "fill")
      g.votes.forEach((v) => {
        if (!v.answered && !v.excluded) {
          v.answered = true;
          v.answer = Math.random() > 0.5;
        }
      });
    if (
      g.state === "GUESSING" &&
      g.votes.every((v) => v.answered || v.excluded)
    )
      g.state = "READY_TO_REVEAL";
    if (action === "reveal") {
      g.state = "REVEALED";
      g.answer = !!value.answer;
      g.revealed++;
      g.votes.forEach((v) => {
        if (v.answered && !v.excluded && v.answer === g.answer)
          g.players.find((p) => p.id === v.player)!.score++;
      });
    }
    if (action === "next" || action === "skip") {
      if (!g.queue.length) g.queue = g.players.map((p) => p.id);
      g.owner = g.queue.shift()!;
      g.round++;
      g.state = "PREPARING";
      g.answer = null;
      g.votes = [];
      g.admitting = false;
      draw(g);
    }
    if (action === "finish") g.state = "FINISHED";
    if (action === "restart" || action === "lobby") {
      g.state = "LOBBY";
      g.players.forEach((p) => (p.score = 0));
      g.revealed = 0;
      g.round = 0;
      g.votes = [];
      used.current = [];
    }
    if (action === "reorder") {
      const ids = value.ids as string[];
      g.players
        .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
        .forEach((p, i) => (p.seat = i + 1));
      g.queue = ids.filter((id) => g.queue.includes(id));
    }
    setGame(g);
  }
  async function act(action: string, value: Record<string, unknown> = {}) {
    if (busy) return;
    setError("");
    if (demo) {
      demoAction(action, value);
      return;
    }
    if (!game) return;
    setBusy(true);
    try {
      await rpc("game_action", {
        p_room: game.id,
        p_action: action,
        p_value: value,
      });
      await load(game.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function enter(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await identity();
      const id = await rpc("game_join", {
        p_code: code,
        p_name: name,
        p_avatar: avatar,
        p_room_name: page === "create" ? roomName : null,
        p_secret: secret,
      });
      if (!id)
        throw Error(
          "เข้าวงไม่ได้ ตรวจรหัสและรหัสลับ หรือลองใหม่ในอีกหนึ่งนาที",
        );
      localStorage.setItem("yesyou-room", id);
      setRoom(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function startDemo() {
    setDemo(true);
    setGame(demoGame());
  }
  function leave() {
    setGame(null);
    setRoom("");
    localStorage.removeItem("yesyou-room");
    setDemo(false);
    setError("");
    setPage("home");
  }
  const nextOwner = game?.queue[0] || game?.players[0]?.id;
  const me = game?.players.find((p) => p.id === game.me),
    owner = game?.players.find((p) => p.id === game.owner),
    host = game?.me === game?.host,
    isOwner = game?.me === game?.owner,
    vote = game?.votes.find((v) => v.player === game.me),
    pending = game?.votes.filter((v) => !v.answered && !v.excluded).length || 0;
  function reorder(from: number, to: number) {
    if (!game || to < 0 || to >= game.players.length) return;
    const ids = game.players.map((p) => p.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    act("reorder", { ids });
  }
  function Scoreboard() {
    if (!game) return null;
    return (
      <div className="score-content">
        <span className="eyebrow">THE FRIENDSHIP LEAGUE</span>
        <h2>ใครรู้ใจที่สุด?</h2>
        {ranked(game.players).map((p) => (
          <div
            className={"score-row " + (p.id === game.me ? "mine" : "")}
            key={p.id}
          >
            <strong className="rank">{p.rank === 1 ? "♛" : p.rank}</strong>
            <Avatar variant={p.avatar} />
            <div className="grow">
              <b>{p.name}</b>
              {p.id === game.me && <small> คุณ</small>}
            </div>
            <strong className="points">
              {p.score}
              <small> คะแนน</small>
            </strong>
          </div>
        ))}
      </div>
    );
  }
  const button = (
    text: string,
    action: () => void,
    cls = "primary",
    disabled = false,
  ) => (
    <button className={cls} disabled={disabled || busy} onClick={action}>
      {text}
    </button>
  );
  return (
    <>
      <a className="skip" href="#main">
        ข้ามไปเนื้อหา
      </a>
      {demo && (
        <div className="demo-bar">
          <b>DEMO • โหมดจำลอง ไม่ได้เชื่อมผู้เล่นจริง</b>
          <label>
            ดูเป็น{" "}
            <select
              aria-label="สลับผู้เล่นใน Demo"
              value={game?.me}
              onChange={(e) =>
                setGame((g) => (g ? { ...g, me: e.target.value } : g))
              }
            >
              {game?.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {game?.state === "GUESSING" &&
            button("จำลองเพื่อนตอบครบ", () => act("fill"), "tiny")}
        </div>
      )}
      {error && (
        <div role="alert" className="error">
          {error}
          <button aria-label="ปิดข้อความ" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {!game && !room && page === "home" ? (
        <main id="main" className="landing">
          <nav>
            <span className="mini-logo">Yes, YOU!</span>
            <span>A GAME OF KNOWING YOU</span>
          </nav>
          <div className="hero">
            <div className="hero-friend friend-a">
              <Avatar variant={0} large />
              <span>รู้นะ คิดอะไรอยู่</span>
            </div>
            <div className="hero-friend friend-b">
              <Avatar variant={5} large />
            </div>
            <div className="hero-friend friend-c">
              <Avatar variant={1} large />
            </div>
            <div className="hero-friend friend-d">
              <Avatar variant={6} large />
            </div>
            <span className="star star-one">✳</span>
            <span className="question-mark">?</span>
            <div className="hero-copy">
              <p className="eyebrow">เพื่อนสนิท… รู้ใจกันแค่ไหน?</p>
              <h1>
                <span>Yes,</span>
                <em>YOU!</em>
              </h1>
              <p>
                เกมจับพิรุธ ทายใจเพื่อน
                <br />
                คำตอบมีแค่ YES หรือ NO
              </p>
              {button("LET’S PLAY  ↗", () => setPage("create"), "cream big")}
              <button className="text-link" onClick={startDemo}>
                ลองเล่น Demo ก่อน →
              </button>
            </div>
          </div>
          <footer>
            <span>3–20 คน · มือถือคนละเครื่อง</span>
            <span>ไม่ต้องสมัครสมาชิก ✦</span>
          </footer>
        </main>
      ) : !game ? (
        <main id="main" className="form-page">
          <button className="back" onClick={leave}>
            ← กลับหน้าแรก
          </button>
          <div className="form-card">
            <span className="eyebrow">GET THE GANG TOGETHER</span>
            <h1>
              ตั้งวงเมาท์
              <br />
              <i>แล้วมาทายใจ</i>
            </h1>
            <div className="tabs">
              <button
                aria-pressed={page === "create"}
                onClick={() => setPage("create")}
              >
                สร้างวง
              </button>
              <button
                aria-pressed={page === "join"}
                onClick={() => setPage("join")}
              >
                เข้าร่วมวง
              </button>
            </div>
            {!configured && (
              <p className="notice">
                ยังไม่ได้เชื่อม Supabase — ทดลองหน้าจอได้ใน Demo Mode
              </p>
            )}
            {room ? (
              <>
                <p>กำลังเชื่อมต่อวงเดิม…</p>
                {button("ออกจากหน้าวงเดิม", leave, "secondary")}
              </>
            ) : (
              <form onSubmit={enter}>
                <label>
                  ชื่อเล่นของคุณ
                  <input
                    maxLength={24}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="เพื่อนเรียกคุณว่าอะไร?"
                    autoComplete="nickname"
                  />
                </label>
                {page === "create" ? (
                  <label>
                    ชื่อวง
                    <input
                      required
                      maxLength={40}
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      placeholder="เช่น แก๊งเลิกงานยัง"
                    />
                  </label>
                ) : (
                  <label>
                    Room Code
                    <input
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value.toLowerCase())}
                      placeholder="เช่น pizza-a1b2c3"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                  </label>
                )}
                <label>
                  รหัสลับวง {page === "create" ? "(ไม่บังคับ)" : ""}
                  <input
                    type="password"
                    maxLength={64}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder={
                      page === "create" ? "เว้นว่างได้" : "ถ้า Host ตั้งไว้"
                    }
                  />
                </label>
                <fieldset>
                  <legend>เลือกหน้าประจำวง</legend>
                  <div className="avatar-picker">
                    {Array.from({ length: 8 }, (_, i) => (
                      <button
                        type="button"
                        className={avatar === i ? "selected" : ""}
                        aria-pressed={avatar === i}
                        aria-label={`เลือกคาแรกเตอร์ ${i + 1}`}
                        onClick={() => setAvatar(i)}
                        key={i}
                      >
                        <Avatar variant={i} />
                        {avatar === i && <span>✓</span>}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <button className="primary" disabled={busy || !configured}>
                  {busy
                    ? "กำลังเข้าวง…"
                    : page === "create"
                      ? "สร้างวงเลย ↗"
                      : "เข้าวงเลย ↗"}
                </button>
              </form>
            )}
            <button className="text-link dark" onClick={startDemo}>
              ลอง Demo Mode →
            </button>
          </div>
        </main>
      ) : (
        <div
          className={
            "game-shell " +
            (["LOBBY", "FINISHED"].includes(game.state)
              ? game.state.toLowerCase()
              : "")
          }
        >
          <header className="game-header">
            <button
              className="brand"
              onClick={() =>
                setConfirm({
                  text: "กลับหน้าแรก? คุณสามารถเข้าวงเดิมด้วยรหัสห้องและตัวตนเดิมได้",
                  action: leave,
                })
              }
            >
              Yes, YOU!
            </button>
            <div>
              <b>{game.name}</b>
              <small>
                {demo
                  ? "จำลอง"
                  : connected
                    ? "● เชื่อมต่อแล้ว"
                    : "○ ขาดการเชื่อมต่อ กำลังลองใหม่"}{" "}
                · {game.code}
              </small>
            </div>
            <button className="score-button" onClick={() => setScores(true)}>
              ♛ คะแนน
            </button>
          </header>
          <main id="main" className="game-layout">
            <section className="play-area">
              {game.state === "LOBBY" ? (
                <>
                  <div className="section-head">
                    <span className="eyebrow">THE GANG'S ALL HERE?</span>
                    <h1>
                      วงพร้อม
                      <br />
                      <i>คนพร้อมยัง?</i>
                    </h1>
                    <p>เรียงที่นั่งให้ตรงกับวง แล้วมาเริ่มจับพิรุธ</p>
                  </div>
                  <div className="share-card">
                    <div>
                      <small>ROOM CODE</small>
                      <strong>{game.code}</strong>
                      <p>ให้เพื่อนเปิดลิงก์ แล้วกรอกรหัสนี้</p>
                      <button
                        className="tiny"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              location.origin + "/?join",
                            );
                            setCopied(true);
                          } catch {
                            setError("คัดลอกไม่ได้ ใช้ที่อยู่เว็บจากแถบด้านบน");
                          }
                        }}
                      >
                        {copied ? "✓ คัดลอกแล้ว" : "คัดลอกลิงก์เข้าวง ↗"}
                      </button>
                    </div>
                    <QRCodeSVG
                      value={location.origin + "/?join"}
                      size={100}
                      title="เปิดหน้าเข้าร่วมวง ไม่ฝังรหัสห้อง"
                    />
                  </div>
                  <div className="list-title">
                    <h2>
                      เพื่อนในวง <span>{game.players.length}/20</span>
                    </h2>
                    <small>เล่นตามลำดับที่นั่ง</small>
                  </div>
                  {game.players.map((p, i) => (
                    <div
                      className="player-card"
                      key={p.id}
                      draggable={host}
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/plain", String(i))
                      }
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (host)
                          reorder(
                            Number(e.dataTransfer.getData("text/plain")),
                            i,
                          );
                      }}
                    >
                      <span className="seat">{i + 1}</span>
                      <Avatar variant={p.avatar} />
                      <div className="grow">
                        <b>
                          {p.name} {p.id === game.me && <small>คุณ</small>}
                        </b>
                        <small>{p.online ? "● ออนไลน์" : "○ ออฟไลน์"}</small>
                      </div>
                      {p.id === game.host && (
                        <span className="host-tag">HOST</span>
                      )}
                      {host && (
                        <div className="arrows">
                          <button
                            aria-label={`เลื่อน ${p.name} ขึ้น`}
                            disabled={i === 0 || busy}
                            onClick={() => reorder(i, i - 1)}
                          >
                            ↑
                          </button>
                          <button
                            aria-label={`เลื่อน ${p.name} ลง`}
                            disabled={i === game.players.length - 1 || busy}
                            onClick={() => reorder(i, i + 1)}
                          >
                            ↓
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {host ? (
                    <>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={game.spicy}
                          onChange={(e) =>
                            act("spicy", { enabled: e.target.checked })
                          }
                        />
                        เปิดคำถามแซ่บ / 18+ 🌶
                      </label>
                      {button(
                        `เริ่มเกม · ${game.players.length} คน →`,
                        () => act("start"),
                        "primary",
                        game.players.length < 3,
                      )}
                      <p className="hint">
                        ขั้นต่ำ 3 คน · เปิดแซ่บเมื่อทุกคนอายุ 18+ และยินยอม
                      </p>
                    </>
                  ) : (
                    <p className="waiting">✳ รอ Host เริ่มเกม</p>
                  )}
                </>
              ) : game.state === "FINISHED" ? (
                <>
                  <span className="eyebrow">THAT'S A WRAP!</span>
                  <h1>
                    เพื่อนรู้ใจ
                    <br />
                    <i>แห่งวงนี้</i>
                  </h1>
                  {game.revealed === 0 ? (
                    <div className="question-card">
                      <h2>ยังไม่มีคะแนน</h2>
                      <p>ยังไม่มีตาที่เฉลย จึงยังไม่มีผู้ชนะหรือโหล่</p>
                    </div>
                  ) : (
                    <>
                      <div className="podium">
                        {[2, 1, 3].map((rank) => (
                          <div
                            className={"podium-place place-" + rank}
                            key={rank}
                          >
                            <span className="trophy">
                              {rank === 1 ? "♛" : "✦"}
                            </span>
                            <h2>อันดับ {rank}</h2>
                            {ranked(game.players)
                              .filter((p) => p.rank === rank)
                              .map((p) => (
                                <div key={p.id}>
                                  <Avatar variant={p.avatar} />
                                  <b>{p.name}</b>
                                  <strong>
                                    {p.score} <small>คะแนน</small>
                                  </strong>
                                </div>
                              ))}
                            {!ranked(game.players).some(
                              (p) => p.rank === rank,
                            ) && (
                              <p>
                                —<br />
                                ไม่มีอันดับนี้
                                <br />
                                เนื่องจากอันดับร่วม
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="last-card">
                        {game.players.every(
                          (p) => p.score === game.players[0].score,
                        ) ? (
                          <h2>วงนี้รู้ใจกันจริงๆ!</h2>
                        ) : (
                          <>
                            <h2>โหล่สุดในซอย ☺</h2>
                            <p>
                              {game.players
                                .filter(
                                  (p) =>
                                    p.score ===
                                    Math.min(
                                      ...game.players.map((p) => p.score),
                                    ),
                                )
                                .map((p) => p.name)
                                .join(" · ")}
                            </p>
                            <small>ความลับเยอะ เพื่อนเลยทายไม่ถูก!</small>
                          </>
                        )}
                      </div>
                    </>
                  )}
                  <Scoreboard />
                  {host && (
                    <div className="actions">
                      {button("เล่นอีกเกม ↻", () => act("restart"))}
                      {button("กลับ Lobby", () => act("lobby"), "cream")}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="round-heading">
                    <span className="eyebrow">
                      ROUND {String(game.round).padStart(2, "0")}
                    </span>
                    <span>
                      {
                        (
                          {
                            PREPARING: "เลือกคำถาม",
                            GUESSING: "กำลังทายใจ",
                            READY_TO_REVEAL: "พร้อมเฉลย",
                            REVEALED: "เฉลยแล้ว",
                          } as Record<string, string>
                        )[game.state]
                      }
                    </span>
                  </div>
                  <div className="owner-heading">
                    <Avatar variant={owner?.avatar} />
                    <div>
                      <span className="turn-tag">
                        {isOwner ? "ตาคุณแล้ว!" : "เจ้าของคำถาม"}
                      </span>
                      <h1>{isOwner ? "เพื่อนรู้ใจคุณไหม?" : owner?.name}</h1>
                    </div>
                  </div>
                  {game.state === "PREPARING" ? (
                    isOwner ? (
                      <>
                        <div className="question-card">
                          <span className="eyebrow">FOR YOUR EYES ONLY</span>
                          <p className="question">{game.question}</p>
                          <small>
                            อ่านให้เพื่อนฟัง แต่อย่าเพิ่งหลุดคำตอบนะ
                          </small>
                        </div>
                        <div className="actions">
                          {button(
                            "↻ สุ่มคำถามใหม่",
                            () => act("reroll"),
                            "secondary",
                          )}
                          {button("อ่านแล้ว เปิดให้เพื่อนทาย →", () =>
                            act("open"),
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="waiting">
                        <span className="wait-star">✳</span>
                        <h2>{owner?.name} กำลังเลือกคำถาม</h2>
                        <p>
                          ฟังคำถามจากเพื่อนในวง
                          <br />
                          อีกเดี๋ยวได้ทายใจแล้ว!
                        </p>
                      </div>
                    )
                  ) : null}
                  {["GUESSING", "READY_TO_REVEAL"].includes(game.state) ? (
                    isOwner ? (
                      <>
                        <div className="question-card">
                          <span className="eyebrow">YOUR LITTLE SECRET</span>
                          <p className="question">{game.question}</p>
                        </div>
                        <div className="progress">
                          <b>
                            ตอบแล้ว{" "}
                            {
                              game.votes.filter(
                                (v) => v.answered && !v.excluded,
                              ).length
                            }{" "}
                            / {game.votes.filter((v) => !v.excluded).length} คน
                          </b>
                          <p>
                            {pending
                              ? "รอเพื่อนอีกนิด ยังเฉลยไม่ได้"
                              : "ครบแล้ว! เลือกคำตอบจริงของคุณ"}
                          </p>
                        </div>
                        {game.state === "READY_TO_REVEAL" && (
                          <div className="yes-no">
                            {[true, false].map((a) => (
                              <button
                                key={String(a)}
                                disabled={busy}
                                className={a ? "yes" : "no"}
                                onClick={() =>
                                  setConfirm({
                                    text: `ยืนยันคำตอบจริง: ${a ? "YES" : "NO"}? เมื่อเฉลยแล้วเปลี่ยนไม่ได้และจะคิดคะแนนทันที`,
                                    action: () => act("reveal", { answer: a }),
                                  })
                                }
                              >
                                คำตอบของฉัน
                                <strong>{a ? "YES ✓" : "NO ✕"}</strong>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <h2 className="guess-title">
                          คิดว่า {owner?.name}
                          <br />
                          จะตอบอะไร?
                        </h2>
                        {!vote || vote.excluded ? (
                          <p className="waiting">
                            คุณไม่ได้ทายในตานี้ รอร่วมเล่นตาถัดไป
                          </p>
                        ) : vote.answered ? (
                          <div className="waiting">
                            <span className="wait-star">✓</span>
                            <h2>ส่งคำตอบ {vote.answer ? "YES" : "NO"} แล้ว</h2>
                            <p>
                              {pending
                                ? `รอเพื่อนอีก ${pending} คน`
                                : `ครบแล้ว! รอ ${owner?.name} เฉลย`}
                            </p>
                          </div>
                        ) : (
                          <>
                            <p className="hint">
                              ฟังคำถามจากเจ้าของคำถาม แล้วเลือกเลย
                            </p>
                            <div className="yes-no">
                              {[true, false].map((a) => (
                                <button
                                  aria-pressed={choice === a}
                                  className={
                                    (a ? "yes" : "no") +
                                    (choice === a ? " chosen" : "")
                                  }
                                  key={String(a)}
                                  onClick={() => setChoice(a)}
                                >
                                  <span>{a ? "คิดว่าใช่" : "คิดว่าไม่"}</span>
                                  <strong>{a ? "YES" : "NO"}</strong>
                                  <span>
                                    {choice === a
                                      ? "✓ เลือกแล้ว"
                                      : a
                                        ? "✓"
                                        : "✕"}
                                  </span>
                                </button>
                              ))}
                            </div>
                            {button(
                              "ยืนยันคำตอบ →",
                              () => act("vote", { answer: choice }),
                              "cream",
                              choice === null,
                            )}
                            <p className="hint">ยืนยันแล้วเปลี่ยนคำตอบไม่ได้</p>
                          </>
                        )}
                      </>
                    )
                  ) : null}
                  {game.state === "REVEALED" && (
                    <>
                      <div className="question-card">
                        <span className="eyebrow">THE TRUTH IS OUT!</span>
                        <p className="question">{game.question}</p>
                        <div className="actual-answer">
                          คำตอบจริง{" "}
                          <strong>{game.answer ? "YES ✓" : "NO ✕"}</strong>
                        </div>
                      </div>
                      <div className="result" role="status">
                        <h2>
                          {isOwner
                            ? `เพื่อนรู้ใจคุณ ${game.votes.filter((v) => !v.excluded && v.answer === game.answer).length} คน`
                            : vote?.excluded || !vote
                              ? "รอบนี้คุณไม่ได้ทาย"
                              : vote.answer === game.answer
                                ? "✦ ✓ ทายถูก! +1"
                                : "☺ รอบนี้อ่านใจพลาด!"}
                        </h2>
                        {game.votes
                          .filter((v) => !v.excluded)
                          .map((v) => (
                            <p key={v.player}>
                              {
                                game.players.find((p) => p.id === v.player)
                                  ?.name
                              }
                              <b>
                                {v.answer === game.answer
                                  ? "✓ ทายถูก +1"
                                  : "✕ พลาดนะ!"}{" "}
                                · {v.answer ? "YES" : "NO"}
                              </b>
                            </p>
                          ))}
                      </div>
                      {host || isOwner || game.me === nextOwner ? (
                        button(
                          game.me === nextOwner
                            ? "ตาถัดไปเป็นคุณ พร้อมแล้วเริ่มเลย →"
                            : "คุยให้จุใจ แล้วไปตาถัดไป →",
                          () => act("next"),
                        )
                      ) : (
                        <p className="waiting">
                          พักคุยกันได้เลย ไม่จับเวลา · รอไปตาถัดไป
                        </p>
                      )}
                    </>
                  )}
                  {["GUESSING", "READY_TO_REVEAL"].includes(game.state) && (
                    <div className="response-list">
                      <h3>ใครส่งแล้วบ้าง?</h3>
                      {game.votes.map((v) => (
                        <div key={v.player}>
                          <span>
                            {game.players.find((p) => p.id === v.player)?.name}
                          </span>
                          <b>
                            {v.excluded
                              ? "ข้ามตานี้"
                              : v.answered
                                ? "✓ ส่งแล้ว"
                                : "… ยังไม่ตอบ"}
                          </b>
                          {host &&
                            !v.answered &&
                            !v.excluded &&
                            button(
                              "ตัดจากตานี้",
                              () =>
                                setConfirm({
                                  text: "ตัดผู้เล่นนี้ออกจากการทายเฉพาะตานี้? จะไม่ได้คะแนนและไม่ต้องรอคำตอบ",
                                  action: () =>
                                    act("exclude", { player: v.player }),
                                }),
                              "tiny",
                            )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="queue">
                    <small>
                      คิวถัดไป ·{" "}
                      {game.queue.length
                        ? "ผู้ที่ยังไม่ได้เล่นในรอบวงนี้"
                        : "เริ่มรอบวงใหม่"}
                    </small>
                    <p>
                      {(game.queue.length
                        ? game.queue
                        : game.players.map((p) => p.id)
                      )
                        .map(
                          (id) => game.players.find((p) => p.id === id)?.name,
                        )
                        .join(" → ")}
                    </p>
                  </div>
                  {host && (
                    <details className="host-tools">
                      <summary>เครื่องมือ Host</summary>
                      {["PREPARING", "REVEALED"].includes(game.state) && (
                        <>
                          {button(
                            game.admitting
                              ? "ปิดรับผู้เล่นเพิ่ม"
                              : "เปิดรับผู้เล่นระหว่างตา",
                            () => act("admit"),
                            "secondary",
                          )}
                          <p>
                            รหัสวง {game.code} ·
                            ผู้เล่นใหม่เริ่มทายได้เมื่อตาถัดไปเปิด
                          </p>
                          <h3>ปรับลำดับตาถัดไป</h3>
                          {game.players.map((p, i) => (
                            <div className="reorder-row" key={p.id}>
                              <span>
                                {i + 1}. {p.name}
                              </span>
                              <button
                                disabled={i === 0 || busy}
                                aria-label={`เลื่อน ${p.name} ขึ้น`}
                                onClick={() => reorder(i, i - 1)}
                              >
                                ↑
                              </button>
                              <button
                                disabled={i === game.players.length - 1 || busy}
                                aria-label={`เลื่อน ${p.name} ลง`}
                                onClick={() => reorder(i, i + 1)}
                              >
                                ↓
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                      {game.state !== "REVEALED" &&
                        button(
                          "ข้ามตานี้โดยไม่คิดคะแนน",
                          () =>
                            setConfirm({
                              text: "ข้ามตาของเจ้าของคำถามโดยไม่คิดคะแนน?",
                              action: () => act("skip"),
                            }),
                          "secondary",
                        )}
                      {button(
                        "จบเกม",
                        () =>
                          setConfirm({
                            text:
                              game.state === "REVEALED"
                                ? "จบเกมและดูสรุป? คะแนนตานี้นับแล้ว"
                                : "จบเกม? ตาที่ยังไม่เฉลยจะไม่ได้คะแนน",
                            action: () => act("finish"),
                          }),
                        "danger",
                      )}
                    </details>
                  )}
                </>
              )}
            </section>
            <aside className="desktop-score">
              <Scoreboard />
              <div className="side-note">
                <span>✳</span>
                <p>
                  ยิ่งสนิท ยิ่งเดายาก
                  <br />
                  ใช่ไหมล่ะ?
                </p>
              </div>
            </aside>
          </main>
          <footer className="game-footer">
            <span>
              คุณคือ {me?.name} {host ? "· HOST" : ""}
            </span>
            <span>YES, YOU! · PLAY NICE, GUESS WILD</span>
          </footer>
        </div>
      )}
      {scores && (
        <div className="modal-backdrop" onClick={() => setScores(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="คะแนนสะสม"
            className="score-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className="close"
              onClick={() => setScores(false)}
            >
              ปิด ×
            </button>
            <Scoreboard />
          </section>
        </div>
      )}
      {confirm && (
        <div className="modal-backdrop">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="confirm-card"
          >
            <h2 id="confirm-title">ขอเช็กอีกที!</h2>
            <p>{confirm.text}</p>
            <div className="actions">
              <button
                autoFocus
                className="secondary"
                onClick={() => setConfirm(null)}
              >
                ยกเลิก
              </button>
              <button
                className="primary"
                onClick={() => {
                  confirm.action();
                  setConfirm(null);
                }}
              >
                ยืนยัน
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
