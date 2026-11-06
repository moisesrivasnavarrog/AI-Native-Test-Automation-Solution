import { expect, test } from '@playwright/test';

// TEMPORARY — capstone quality-gate demonstration only.
// This test fails on purpose to prove the "Observability unit tests"
// gate propagates a real failure to a red check. It lives on a
// throwaway branch/PR and must NEVER be merged to main.
test.describe('QUALITY GATE DEMO — do not merge', () => {
  test('intentional failure proves the gate goes red', () => {
    expect(1, 'deliberate failure for AC-06 evidence').toBe(2);
  });
});
