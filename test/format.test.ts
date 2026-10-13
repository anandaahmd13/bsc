import { describe, expect, it } from 'vitest';
import { safeTelegramHtml } from '../src/notify/format.js';

describe('Telegram HTML metadata escaping', () => {
  it('escapes markup and strips control/bidi characters', () => {
    expect(safeTelegramHtml('<b>& hello\u202E\u0000')).toBe('&lt;b&gt;&amp; hello');
  });
});
