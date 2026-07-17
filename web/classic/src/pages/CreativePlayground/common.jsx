/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

/* Derived from MIT-licensed CookSleep/gpt_image_playground and alasano/sora-2-playground. */

import React, { useEffect, useState } from 'react';
import { AlertCircle, Save, X } from 'lucide-react';

export const IMAGE_SETTINGS_KEY = 'newapi_creative_image_settings';
export const VIDEO_SETTINGS_KEY = 'newapi_creative_video_settings';
export const IMAGE_HISTORY_KEY = 'newapi_creative_image_history';
export const VIDEO_HISTORY_KEY = 'newapi_creative_video_history';

export const getDefaultApiUrl = () =>
  typeof window === 'undefined' ? '/v1' : `${window.location.origin}/v1`;

export const readJson = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

export const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Browser storage is optional; generated content remains visible in memory.
  }
};

export const getInitialSettings = (key) => ({
  apiUrl: getDefaultApiUrl(),
  apiKey: '',
  ...readJson(key, {}),
});

export const normalizeSettings = (settings) => ({
  ...settings,
  apiUrl: (settings.apiUrl || getDefaultApiUrl()).replace(/\/$/, ''),
});

export const apiUrlFor = (settings, suffix) =>
  `${(settings.apiUrl || getDefaultApiUrl()).replace(/\/$/, '')}${suffix}`;

export const authHeaders = (settings, json = false) => {
  const headers = {};
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
};

export const describeApiError = (response, body) => {
  const raw =
    body?.error?.message ||
    body?.error ||
    body?.message ||
    `请求失败（${response.status}）`;

  if (response.status === 401 || response.status === 403) {
    return '密钥无效或没有该模型权限，请检查 Playground 设置。';
  }
  if (response.status === 429) {
    return '请求过于频繁或额度不足，请稍后重试。';
  }
  return typeof raw === 'string' ? raw : `请求失败（${response.status}）`;
};

export function SettingsDialog({ open, onClose, value, onSave, title }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  if (!open) return null;

  return (
    <div
      className='creative-modal-backdrop'
      role='presentation'
      onMouseDown={onClose}
    >
      <div
        className='creative-modal'
        role='dialog'
        aria-modal='true'
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className='creative-modal-header'>
          <div>
            <div className='creative-eyebrow'>PLAYGROUND SETTINGS</div>
            <h2>{title}</h2>
          </div>
          <button
            className='creative-icon-button'
            type='button'
            onClick={onClose}
            aria-label='关闭设置'
          >
            <X size={18} />
          </button>
        </div>
        <label className='creative-field'>
          <span>API 地址</span>
          <input
            value={draft.apiUrl}
            onChange={(event) =>
              setDraft({ ...draft, apiUrl: event.target.value })
            }
            placeholder={getDefaultApiUrl()}
          />
          <small>默认指向当前 New API 的 OpenAI 兼容接口。</small>
        </label>
        <label className='creative-field'>
          <span>访问密钥</span>
          <input
            type='password'
            value={draft.apiKey}
            onChange={(event) =>
              setDraft({ ...draft, apiKey: event.target.value })
            }
            placeholder='sk-...'
            autoComplete='off'
          />
          <small>
            第一阶段密钥只保存在当前浏览器，后续会替换为自动创建的专用密钥。
          </small>
        </label>
        <div className='creative-modal-actions'>
          <button
            className='creative-button secondary'
            type='button'
            onClick={onClose}
          >
            取消
          </button>
          <button
            className='creative-button primary'
            type='button'
            onClick={() => onSave(draft)}
          >
            <Save size={16} /> 保存配置
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description }) {
  return (
    <div className='creative-empty-state'>
      {icon}
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export function ErrorNotice({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className='creative-error' role='alert'>
      <AlertCircle size={17} />
      <span>{message}</span>
      <button type='button' onClick={onDismiss} aria-label='关闭错误'>
        <X size={16} />
      </button>
    </div>
  );
}
