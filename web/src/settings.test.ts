import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';

const STORAGE_KEY = 'inhouse.settings.v1';

describe('settings persistence', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('returns defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips a full settings object', () => {
    const settings = {
      baseUrl: 'http://server:8770',
      token: 'secret',
      vadThreshold: 0.05,
      playAloud: false,
      bargeIn: true,
    };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });

  it('parses settings saved before barge-in existed with bargeIn=false', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ baseUrl: 'http://old:1', token: '', vadThreshold: 0.03, playAloud: true })
    );
    const settings = loadSettings();
    expect(settings.bargeIn).toBe(false);
    expect(settings.baseUrl).toBe('http://old:1');
    expect(settings.vadThreshold).toBe(0.03);
  });

  it('falls back to defaults on malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
