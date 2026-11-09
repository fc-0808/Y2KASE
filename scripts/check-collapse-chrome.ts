import assert from "node:assert/strict";
import { stepCollapseChrome } from "../src/components/catalog/collapse-chrome";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

test("stays open at the top of the page", () => {
  const next = stepCollapseChrome(true, 40, 0, 20);
  assert.equal(next.hidden, false);
  assert.equal(next.acc, 0);
});

test("a small downward jitter does not hide the bar", () => {
  const next = stepCollapseChrome(false, 0, 200, 4);
  assert.equal(next.hidden, false);
  assert.equal(next.acc, 4);
});

test("a sustained downward scroll hides the bar", () => {
  let state = stepCollapseChrome(false, 0, 200, 8);
  state = stepCollapseChrome(state.hidden, state.acc, 208, 8);
  assert.equal(state.hidden, true);
});

test("scrolling back up shows the bar again", () => {
  let state = stepCollapseChrome(true, 0, 400, -8);
  state = stepCollapseChrome(state.hidden, state.acc, 392, -8);
  assert.equal(state.hidden, false);
});

test("reversing direction resets the accumulator", () => {
  const next = stepCollapseChrome(false, 10, 200, -3);
  assert.equal(next.hidden, false);
  assert.equal(next.acc, -3);
});

test("an address-bar jump downward does not hide the bar", () => {
  const next = stepCollapseChrome(false, 10, 80, 200);
  assert.equal(next.hidden, false);
  assert.equal(next.acc, 0);
});

test("a fast scroll upward shows the bar", () => {
  const next = stepCollapseChrome(true, 0, 500, -200);
  assert.equal(next.hidden, false);
  assert.equal(next.acc, 0);
});

console.log(`\n${passed} collapse-chrome checks passed`);
