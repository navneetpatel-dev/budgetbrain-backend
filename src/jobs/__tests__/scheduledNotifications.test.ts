import { afterEach, describe, expect, it } from 'vitest';
import { start, stop } from '../index';

describe('scheduled jobs aggregator', () => {
  afterEach(() => {
    stop();
  });

  it('registers the cron tasks and stops them', () => {
    expect(() => start()).not.toThrow();
    expect(() => stop()).not.toThrow();
  });
});
