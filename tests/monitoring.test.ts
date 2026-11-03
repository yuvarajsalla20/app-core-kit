import { describe, expect, it } from 'vitest';
import { scrubEvent, startMonitoring } from '../src/monitoring';

describe('scrubEvent', () => {
  it('scrubs every text field and removes user, request and breadcrumbs', () => {
    const event = scrubEvent({
      message: 'failed for me@example.com',
      exception: { values: [{ type: 'Error', value: 'card 4111 1111 1111 1111', stacktrace: { frames: [{ filename: '/u/jo@x.com/app.js' }] } }] },
      extra: { note: 'call (469) 555-0199', n: 3 },
      tags: { where: 'home' },
      user: { email: 'a@b.co' },
      request: { url: 'https://x.test/?token=abc' },
      breadcrumbs: [{ message: 'typed Patel 170' }],
    });
    expect(JSON.stringify(event)).not.toMatch(/example\.com|4111|555-0199|a@b\.co|jo@x\.com|token=|Patel/);
    expect(event).not.toHaveProperty('user');
    expect(event).toMatchObject({ extra: { n: 3 }, tags: { where: 'home' } });
  });
});

describe('startMonitoring', () => {
  it('does nothing beyond catching errors when there is no address', async () => {
    await expect(startMonitoring({})).resolves.toBeUndefined();
  });
});
