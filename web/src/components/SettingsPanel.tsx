import { useState } from 'react';
import type { Settings } from '../settings';

interface Props {
  open: boolean;
  settings: Settings;
  onChange: (settings: Settings) => void;
  onClose: () => void;
}

export function SettingsPanel({ open, settings, onChange, onClose }: Props) {
  const [showToken, setShowToken] = useState(false);
  if (!open) return null;

  return (
    <section className="settings-panel" aria-label="Settings">
      <div className="settings-row">
        <label htmlFor="set-baseurl">Server base URL</label>
        <input
          id="set-baseurl"
          type="url"
          placeholder="Same origin (default)"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={settings.baseUrl}
          onChange={(e) => onChange({ ...settings, baseUrl: e.target.value })}
        />
      </div>
      <div className="settings-row">
        <label htmlFor="set-token">Bearer token</label>
        <div className="settings-inline">
          <input
            id="set-token"
            type={showToken ? 'text' : 'password'}
            placeholder="None"
            autoComplete="off"
            value={settings.token}
            onChange={(e) => onChange({ ...settings, token: e.target.value })}
          />
          <button type="button" className="btn-subtle" onClick={() => setShowToken((s) => !s)}>
            {showToken ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <div className="settings-row">
        <label htmlFor="set-vad">
          Hands-free sensitivity <span className="settings-value">{settings.vadThreshold.toFixed(3)}</span>
        </label>
        <input
          id="set-vad"
          type="range"
          min="0.005"
          max="0.15"
          step="0.005"
          value={settings.vadThreshold}
          onChange={(e) => onChange({ ...settings, vadThreshold: Number(e.target.value) })}
        />
        <p className="settings-help">Lower = more sensitive (RMS threshold for speech detection).</p>
      </div>
      <div className="settings-row settings-row-toggle">
        <label htmlFor="set-playaloud">Play replies aloud</label>
        <input
          id="set-playaloud"
          type="checkbox"
          checked={settings.playAloud}
          onChange={(e) => onChange({ ...settings, playAloud: e.target.checked })}
        />
      </div>
      <div className="settings-row settings-row-toggle">
        <label htmlFor="set-bargein">Barge-in (interrupt while speaking)</label>
        <input
          id="set-bargein"
          type="checkbox"
          checked={settings.bargeIn}
          onChange={(e) => onChange({ ...settings, bargeIn: e.target.checked })}
        />
      </div>
      <button type="button" className="btn-subtle settings-close" onClick={onClose}>
        Done
      </button>
    </section>
  );
}
