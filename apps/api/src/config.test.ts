import { describe, expect, it } from 'vitest';
import { resolveHaConfig } from './config.js';

describe('resolveHaConfig', () => {
  it('returns supervised mode when SUPERVISOR_TOKEN is set', () => {
    const result = resolveHaConfig({ SUPERVISOR_TOKEN: 'super-secret' });
    expect(result).toEqual({
      url: 'http://supervisor/core',
      token: 'super-secret',
      mode: 'supervised',
    });
  });

  it('prefers SUPERVISOR_TOKEN over HA_URL/HA_TOKEN', () => {
    const result = resolveHaConfig({
      SUPERVISOR_TOKEN: 'super-secret',
      HA_URL: 'http://192.168.1.10:8123',
      HA_TOKEN: 'standalone-token',
    });
    expect(result.mode).toBe('supervised');
    expect(result.url).toBe('http://supervisor/core');
    expect(result.token).toBe('super-secret');
  });

  it('returns standalone mode with HA_URL/HA_TOKEN', () => {
    const result = resolveHaConfig({
      HA_URL: 'http://192.168.1.10:8123',
      HA_TOKEN: 'long-lived-token',
    });
    expect(result).toEqual({
      url: 'http://192.168.1.10:8123',
      token: 'long-lived-token',
      mode: 'standalone',
    });
  });

  it('throws when HA_URL is missing in standalone mode', () => {
    expect(() => resolveHaConfig({ HA_TOKEN: 'token' })).toThrow(/HA_URL/);
  });

  it('throws when HA_TOKEN is missing in standalone mode', () => {
    expect(() => resolveHaConfig({ HA_URL: 'http://x:8123' })).toThrow(/HA_TOKEN/);
  });

  it('throws on empty env', () => {
    expect(() => resolveHaConfig({})).toThrow(/HA_URL/);
  });
});
