// public/js/ui/toasts.js: the toast stack's lifetime (merging and describeError are in client-static.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toast, dismissToast, toastIds } from '../public/js/ui/toasts.js';

test('toasts: dismissing a toast that is already leaving still removes it', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const id = toast('该队友当前没有战场', 'warn');
  dismissToast(id); // the first press: the exit animation starts
  dismissToast(id); // a second press while it fades used to cancel the removal and leave it on screen, invisible
  t.mock.timers.tick(200);
  assert.ok(!toastIds().includes(id), 'the faded toast left the stack');
});
