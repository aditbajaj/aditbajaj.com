import { expect, test } from "bun:test";
import { brailleCharacter } from "./braille";

test("an empty cell is the blank Braille pattern", () => {
  expect(brailleCharacter(Array(8).fill(false))).toBe("\u2800");
});

test("the top-right sample is Unicode dot 4, not dot 2", () => {
  expect(brailleCharacter([false, true, false, false, false, false, false, false])).toBe("\u2808");
});

test("all eight samples fill the cell", () => {
  expect(brailleCharacter(Array(8).fill(true))).toBe("\u28FF");
});
