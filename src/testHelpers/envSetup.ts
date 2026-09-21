/**
 * Loaded before any app module. `src/config/env.ts` parses process.env at
 * import time, so CI-required secrets must exist before that happens.
 */
process.env.NODE_ENV ||= 'test';
process.env.TZ ||= 'UTC';
process.env.OPENAI_API_KEY ||= 'sk-test-ci-not-a-real-key';
process.env.JWT_ACCESS_SECRET ||= 'test_access_secret_32_characters_minimum!';
process.env.JWT_REFRESH_SECRET ||= 'test_refresh_secret_32_characters_minimum!';
