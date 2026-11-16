import { expect, it } from "vitest";
import { avatars } from "../src/avatars";
import { Avatar } from "../src/Avatar";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
it("twenty distinct character illustrations, backgrounds and accessories", () => {
  expect(avatars).toHaveLength(20);
  expect(new Set(avatars.map((a) => a.bg)).size).toBe(20);
  expect(new Set(avatars.map((a) => a.accessory)).size).toBe(20);
  expect(avatars.filter((a) => a.gender === "woman")).toHaveLength(10);
  expect(avatars.filter((a) => a.gender === "man")).toHaveLength(10);
  const drawings = avatars.map((_, i) =>
    renderToStaticMarkup(createElement(Avatar, { variant: i })),
  );
  expect(new Set(drawings).size).toBe(20);
});
