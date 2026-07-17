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

import React, { useState } from 'react';
import {
  AlertCircle,
  Download,
  Image as ImageIcon,
  KeyRound,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  apiUrlFor,
  authHeaders,
  describeApiError,
  EmptyState,
  ErrorNotice,
  getInitialSettings,
  IMAGE_HISTORY_KEY,
  IMAGE_SETTINGS_KEY,
  normalizeSettings,
  readJson,
  SettingsDialog,
  writeJson,
} from './common';
import './creative.css';

const MAX_HISTORY_ITEMS = 80;

const downloadImage = (item) => {
  const anchor = document.createElement('a');
  anchor.href = item.url;
  anchor.download = `newapi-image-${item.id}.${item.format || 'png'}`;
  anchor.rel = 'noopener';
  anchor.click();
};

export default function ImagePlayground() {
  const [settings, setSettings] = useState(() =>
    getInitialSettings(IMAGE_SETTINGS_KEY),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('gpt-image-1');
  const [size, setSize] = useState('auto');
  const [quality, setQuality] = useState('auto');
  const [background, setBackground] = useState('auto');
  const [format, setFormat] = useState('png');
  const [count, setCount] = useState('1');
  const [history, setHistory] = useState(() => readJson(IMAGE_HISTORY_KEY, []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const saveSettings = (nextSettings) => {
    const normalized = normalizeSettings(nextSettings);
    setSettings(normalized);
    writeJson(IMAGE_SETTINGS_KEY, normalized);
    setSettingsOpen(false);
  };

  const generate = async () => {
    if (!prompt.trim()) {
      setError('请先输入图像提示词。');
      return;
    }
    if (!settings.apiKey.trim()) {
      setSettingsOpen(true);
      return;
    }

    setBusy(true);
    setError('');
    try {
      const response = await fetch(apiUrlFor(settings, '/images/generations'), {
        method: 'POST',
        headers: authHeaders(settings, true),
        body: JSON.stringify({
          model,
          prompt: prompt.trim(),
          size,
          quality,
          background,
          output_format: format,
          n: Number(count),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(describeApiError(response, body));
      }

      const data = Array.isArray(body.data) ? body.data : [];
      const created = data
        .map((item, index) => ({
          id: `${Date.now()}-${index}`,
          prompt: prompt.trim(),
          model,
          format,
          createdAt: Date.now(),
          url:
            item.url ||
            (item.b64_json
              ? `data:image/${format};base64,${item.b64_json}`
              : ''),
        }))
        .filter((item) => item.url);

      if (!created.length) {
        throw new Error('接口返回成功，但没有可显示的图像结果。');
      }

      const nextHistory = [...created, ...history].slice(0, MAX_HISTORY_ITEMS);
      setHistory(nextHistory);
      writeJson(IMAGE_HISTORY_KEY, nextHistory);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : '图像生成失败。',
      );
    } finally {
      setBusy(false);
    }
  };

  const removeItem = (id) => {
    const nextHistory = history.filter((item) => item.id !== id);
    setHistory(nextHistory);
    writeJson(IMAGE_HISTORY_KEY, nextHistory);
  };

  const clearHistory = () => {
    setHistory([]);
    writeJson(IMAGE_HISTORY_KEY, []);
  };

  return (
    <div className='creative-page image-playground-page'>
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        value={settings}
        onSave={saveSettings}
        title='图像生成配置'
      />

      <div className='creative-page-header'>
        <div>
          <div className='creative-eyebrow'>OPENAI COMPATIBLE</div>
          <h1>
            <ImageIcon size={23} /> AI ImageHub
          </h1>
          <p>基于 CookSleep/gpt_image_playground 的图像创作工作台</p>
        </div>
        <div className='creative-header-actions'>
          <span className={`creative-status ${settings.apiKey ? 'ready' : ''}`}>
            <KeyRound size={15} />
            {settings.apiKey ? '已配置密钥' : '未配置密钥'}
          </span>
          <button
            className='creative-icon-button'
            type='button'
            onClick={() => setSettingsOpen(true)}
            aria-label='图像配置'
          >
            <Settings size={19} />
          </button>
        </div>
      </div>

      <ErrorNotice message={error} onDismiss={() => setError('')} />

      <div className='image-toolbar'>
        <label className='creative-search-field'>
          <span>提示词</span>
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                generate();
              }
            }}
            placeholder='描述你想生成的图像...'
          />
        </label>
        <label className='creative-field compact'>
          <span>模型</span>
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
          >
            <option value='gpt-image-1'>gpt-image-1</option>
            <option value='dall-e-3'>dall-e-3</option>
            <option value='dall-e-2'>dall-e-2</option>
          </select>
        </label>
        <label className='creative-field compact'>
          <span>尺寸</span>
          <select
            value={size}
            onChange={(event) => setSize(event.target.value)}
          >
            <option value='auto'>自动</option>
            <option value='1024x1024'>正方形</option>
            <option value='1536x1024'>横向</option>
            <option value='1024x1536'>纵向</option>
          </select>
        </label>
        <label className='creative-field compact'>
          <span>质量</span>
          <select
            value={quality}
            onChange={(event) => setQuality(event.target.value)}
          >
            <option value='auto'>自动</option>
            <option value='low'>低</option>
            <option value='medium'>中</option>
            <option value='high'>高</option>
          </select>
        </label>
        <label className='creative-field compact'>
          <span>数量</span>
          <select
            value={count}
            onChange={(event) => setCount(event.target.value)}
          >
            <option value='1'>1</option>
            <option value='2'>2</option>
            <option value='4'>4</option>
          </select>
        </label>
        <button
          className='creative-button primary image-generate-button'
          type='button'
          onClick={generate}
          disabled={busy}
        >
          <Sparkles size={17} />
          {busy ? '生成中...' : '生成图像'}
        </button>
      </div>

      <div className='image-secondary-options'>
        <label>
          格式
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value)}
          >
            <option value='png'>PNG</option>
            <option value='jpeg'>JPEG</option>
            <option value='webp'>WEBP</option>
          </select>
        </label>
        <label>
          背景
          <select
            value={background}
            onChange={(event) => setBackground(event.target.value)}
          >
            <option value='auto'>自动</option>
            <option value='transparent'>透明</option>
            <option value='opaque'>不透明</option>
          </select>
        </label>
        <span className='creative-hint'>按 Ctrl/⌘ + Enter 快速生成</span>
      </div>

      <section className='creative-section'>
        <div className='creative-section-title'>
          <div>
            <h2>创作历史</h2>
            <span>
              {history.length
                ? `${history.length} 个结果`
                : '生成的图像会显示在这里'}
            </span>
          </div>
          <button
            className='creative-icon-button'
            type='button'
            onClick={clearHistory}
            disabled={!history.length}
            aria-label='清空历史'
          >
            <Trash2 size={17} />
          </button>
        </div>

        {history.length === 0 ? (
          <EmptyState
            icon={<ImageIcon size={42} />}
            title='还没有图像任务'
            description='输入提示词并点击生成图像开始创作。'
          />
        ) : (
          <div className='image-grid'>
            {history.map((item) => (
              <article className='image-card' key={item.id}>
                <div className='image-card-preview'>
                  {item.url ? (
                    <img src={item.url} alt={item.prompt} />
                  ) : (
                    <EmptyState
                      icon={<AlertCircle size={28} />}
                      title='无图像'
                      description=''
                    />
                  )}
                </div>
                <div className='image-card-body'>
                  <p>{item.prompt}</p>
                  <div className='image-card-meta'>
                    <span>{item.model}</span>
                    <button
                      className='creative-icon-button small'
                      type='button'
                      onClick={() => downloadImage(item)}
                      aria-label='下载图像'
                    >
                      <Download size={15} />
                    </button>
                    <button
                      className='creative-icon-button small danger'
                      type='button'
                      onClick={() => removeItem(item.id)}
                      aria-label='删除图像'
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
