import { describe, it, expect } from "vitest";
import { ranked, demoGame } from "../src/game";
import questions from "../src/questions.json";
describe("อันดับร่วม", () => {
  it("คะแนน 3,3,1 เป็นอันดับ 1,1,3 โดยลำดับเข้าห้องไม่ตัดสินผู้ชนะ", () => {
    const p = demoGame().players.slice(0, 3);
    p[0].score = 3;
    p[1].score = 3;
    p[2].score = 1;
    expect(ranked(p).map((p) => p.rank)).toEqual([1, 1, 3]);
    expect(ranked([p[1], p[0], p[2]]).map((p) => p.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });
  it("ทุกคนเสมอมีแค่อันดับหนึ่ง", () =>
    expect(ranked(demoGame().players).map((p) => p.rank)).toEqual([
      1, 1, 1, 1,
    ]));
});
describe("คลังคำถาม", () => {
  it("อย่างน้อย 100 ข้อ รหัสไม่ซ้ำ และข้อมูลครบ", () => {
    expect(questions.length).toBeGreaterThanOrEqual(100);
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
    questions.forEach((q) => {
      expect(q.text.endsWith("ใช่หรือไม่?")).toBe(true);
      expect(q.category.length).toBeGreaterThan(0);
      expect([0, 1]).toContain(q.spice);
    });
  });
  it("มีหมวดแซ่บที่แยกจากค่าเริ่มต้น", () => {
    expect(questions.filter((q) => !q.spice).length).toBeGreaterThanOrEqual(
      100,
    );
    expect(questions.some((q) => q.spice)).toBe(true);
  });
});
