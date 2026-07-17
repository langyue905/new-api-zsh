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

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Download,
  KeyRound,
  LoaderCircle,
  Play,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import {
  apiUrlFor,
  authHeaders,
  describeApiError,
  EmptyState,
  ErrorNotice,
  getInitialSettings,
  normalizeSettings,
  readJson,
  SettingsDialog,
  VIDEO_HISTORY_KEY,
  VIDEO_SETTINGS_KEY,
  writeJson,
} from './common';
import './creative.css';

const MAX_VIDEO_HISTORY = 40;
const FINAL_STATUSES = ['completed', 'failed', 'cancelled'];

const videoStatusLabel = (status) =>
  ({
    queued: '排队中',
    in_progress: '生成中',
    processing: '生成中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
  })[status] ||
  status ||
  '处理中';

const getVideoId = (body) => {
  const data = body?.data || body || {};
  return data.id || data.video_id || data.task_id || '';
};

export default function VideoPlayground() {
  const [settings, setSettings] = useState(() =>
    getInitialSettings(VIDEO_SETTINGS_KEY),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('sora-2');
  const [size, setSize] = useState('720x1280');
  const [seconds, setSeconds] = useState('4');
  const [reference, setReference] = useState(null);
  const [jobs, setJobs] = useState(() => readJson(VIDEO_HISTORY_KEY, []));
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remixPrompt, setRemixPrompt] = useState('');
  const [remixBusy, setRemixBusy] = useState(false);
  const [videoUrls, setVideoUrls] = useState({});
  const pollingRef = useRef({});
  const videoUrlsRef = useRef({});

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === activeId) || jobs[0] || null,
    [activeId, jobs],
  );

  useEffect(() => {
    videoUrlsRef.current = videoUrls;
  }, [videoUrls]);

  useEffect(
    () => () => {
      Object.values(videoUrlsRef.current).forEach((url) =>
        URL.revokeObjectURL(url),
      );
    },
    [],
  );

  const saveSettings = (nextSettings) => {
    const normalized = normalizeSettings(nextSettings);
    setSettings(normalized);
    writeJson(VIDEO_SETTINGS_KEY, normalized);
    setSettingsOpen(false);
  };

  const updateJob = useCallback((id, changes) => {
    setJobs((previous) => {
      const next = previous.map((job) =>
        job.id === id ? { ...job, ...changes } : job,
      );
      writeJson(VIDEO_HISTORY_KEY, next);
      return next;
    });
  }, []);

  const addJob = useCallback((job) => {
    setJobs((previous) => {
      const next = [
        job,
        ...previous.filter((item) => item.id !== job.id),
      ].slice(0, MAX_VIDEO_HISTORY);
      writeJson(VIDEO_HISTORY_KEY, next);
      return next;
    });
    setActiveId(job.id);
  }, []);

  const loadVideoContent = useCallback(
    async (id) => {
      if (!settings.apiKey || videoUrlsRef.current[id]) return;
      try {
        const response = await fetch(
          apiUrlFor(settings, `/videos/${encodeURIComponent(id)}/content`),
          { headers: authHeaders(settings) },
        );
        if (!response.ok) return;
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setVideoUrls((previous) => ({ ...previous, [id]: url }));
      } catch {
        // The result card remains available and can be retried by refreshing.
      }
    },
    [settings],
  );

  const pollJob = useCallback(
    async (id) => {
      if (!settings.apiKey || pollingRef.current[id]) return;
      pollingRef.current[id] = true;
      let retryDelay = 0;

      try {
        const response = await fetch(
          apiUrlFor(settings, `/videos/${encodeURIComponent(id)}`),
          { headers: authHeaders(settings) },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(describeApiError(response, body));
        }

        const data = body.data || body;
        const status = data.status || 'processing';
        updateJob(id, {
          status,
          progress: data.progress ?? null,
          error: data.error?.message || '',
        });

        if (status === 'completed') {
          await loadVideoContent(id);
        } else if (!FINAL_STATUSES.includes(status)) {
          retryDelay = 3500;
        }
      } catch (pollError) {
        updateJob(id, {
          error:
            pollError instanceof Error
              ? pollError.message
              : '视频状态查询失败。',
        });
        retryDelay = 7000;
      } finally {
        pollingRef.current[id] = false;
        if (retryDelay) {
          window.setTimeout(() => pollJob(id), retryDelay);
        }
      }
    },
    [loadVideoContent, settings, updateJob],
  );

  useEffect(() => {
    jobs
      .filter((job) => job.id && !FINAL_STATUSES.includes(job.status))
      .forEach((job) => pollJob(job.id));
  }, [jobs.length, pollJob]);

  useEffect(() => {
    if (activeJob?.status === 'completed' && !videoUrls[activeJob.id]) {
      loadVideoContent(activeJob.id);
    }
  }, [activeJob, loadVideoContent, videoUrls]);

  const createVideo = async () => {
    if (!prompt.trim()) {
      setError('请先输入视频提示词。');
      return;
    }
    if (!settings.apiKey.trim()) {
      setSettingsOpen(true);
      return;
    }

    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt.trim());
      form.append('size', size);
      form.append('seconds', seconds);
      if (reference) form.append('input_reference', reference);

      const response = await fetch(apiUrlFor(settings, '/videos'), {
        method: 'POST',
        headers: authHeaders(settings),
        body: form,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(describeApiError(response, body));
      }

      const data = body.data || body;
      const id = getVideoId(body);
      if (!id) {
        throw new Error('接口返回成功，但没有返回视频任务 ID。');
      }

      addJob({
        id,
        prompt: prompt.trim(),
        model,
        size,
        seconds,
        status: data.status || 'queued',
        createdAt: Date.now(),
        error: '',
      });
      window.setTimeout(() => pollJob(id), 500);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : '视频生成失败。',
      );
    } finally {
      setBusy(false);
    }
  };

  const remixVideo = async () => {
    if (!activeJob?.id || !remixPrompt.trim()) return;
    if (!settings.apiKey.trim()) {
      setSettingsOpen(true);
      return;
    }

    setRemixBusy(true);
    setError('');
    try {
      const response = await fetch(
        apiUrlFor(
          settings,
          `/videos/${encodeURIComponent(activeJob.id)}/remix`,
        ),
        {
          method: 'POST',
          headers: authHeaders(settings, true),
          body: JSON.stringify({ prompt: remixPrompt.trim() }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(describeApiError(response, body));
      }

      const data = body.data || body;
      const id = getVideoId(body);
      if (!id) throw new Error('Remix 请求没有返回视频任务 ID。');

      addJob({
        id,
        prompt: remixPrompt.trim(),
        sourceId: activeJob.id,
        model: activeJob.model,
        size: activeJob.size,
        seconds: activeJob.seconds,
        status: data.status || 'queued',
        createdAt: Date.now(),
        error: '',
      });
      setRemixPrompt('');
      window.setTimeout(() => pollJob(id), 500);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : '视频 Remix 失败。',
      );
    } finally {
      setRemixBusy(false);
    }
  };

  const removeJob = (id) => {
    const nextJobs = jobs.filter((job) => job.id !== id);
    setJobs(nextJobs);
    writeJson(VIDEO_HISTORY_KEY, nextJobs);
    if (activeId === id) setActiveId(null);
    if (videoUrlsRef.current[id]) {
      URL.revokeObjectURL(videoUrlsRef.current[id]);
      setVideoUrls((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
    }
  };

  return (
    <div className='creative-page video-playground-page'>
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        value={settings}
        onSave={saveSettings}
        title='视频生成配置'
      />

      <div className='creative-page-header video-header'>
        <div>
          <div className='creative-eyebrow'>SORA 2 PLAYGROUND</div>
          <h1>
            <Video size={23} /> AI VideoHub
          </h1>
          <p>基于 alasano/sora-2-playground 的视频创作工作台</p>
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
            aria-label='视频配置'
          >
            <Settings size={19} />
          </button>
        </div>
      </div>

      <ErrorNotice message={error} onDismiss={() => setError('')} />

      <div className='video-layout'>
        <section className='video-form-panel'>
          <div className='creative-panel-title'>
            <span>提示词</span>
            <span className='creative-muted'>镜头、主体、动作、场景和风格</span>
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder='例如：电影感广角镜头，金色夕阳下的城市天台，镜头缓慢向前推进。'
            rows={5}
          />

          <div className='video-form-grid'>
            <label className='creative-field'>
              <span>模型</span>
              <select
                value={model}
                onChange={(event) => setModel(event.target.value)}
              >
                <option value='sora-2'>Sora 2</option>
                <option value='sora-2-pro'>Sora 2 Pro</option>
              </select>
            </label>
            <label className='creative-field'>
              <span>画面尺寸</span>
              <select
                value={size}
                onChange={(event) => setSize(event.target.value)}
              >
                <option value='720x1280'>720x1280（竖屏）</option>
                <option value='1280x720'>1280x720（横屏）</option>
                <option value='1024x1792'>1024x1792（高竖屏）</option>
                <option value='1792x1024'>1792x1024（宽屏）</option>
              </select>
            </label>
          </div>

          <div className='creative-panel-title'>
            <span>视频时长</span>
          </div>
          <div className='creative-radio-row'>
            {['4', '8', '12'].map((value) => (
              <label key={value}>
                <input
                  type='radio'
                  checked={seconds === value}
                  onChange={() => setSeconds(value)}
                />
                {value} 秒
              </label>
            ))}
          </div>

          <label className='creative-upload'>
            <Upload size={17} />
            <span>
              {reference ? reference.name : '选择参考图片或视频（可选）'}
            </span>
            <input
              type='file'
              accept='image/*,video/*'
              onChange={(event) =>
                setReference(event.target.files?.[0] || null)
              }
            />
          </label>

          <button
            className='creative-button primary full'
            type='button'
            disabled={busy}
            onClick={createVideo}
          >
            <Sparkles size={17} />
            {busy ? '提交中...' : '生成视频'}
          </button>
        </section>

        <section className='video-result-panel'>
          <div className='creative-panel-title'>
            <div>
              <span>视频结果</span>
              <small>
                {activeJob
                  ? `${activeJob.model} · ${activeJob.size} · ${activeJob.seconds} 秒`
                  : '生成进度和视频将在这里显示'}
              </small>
            </div>
            {activeJob && (
              <button
                className='creative-icon-button'
                type='button'
                onClick={() => pollJob(activeJob.id)}
                aria-label='刷新状态'
              >
                <RefreshCw size={17} />
              </button>
            )}
          </div>

          {activeJob ? (
            <div className='video-result-content'>
              {videoUrls[activeJob.id] ? (
                <video controls src={videoUrls[activeJob.id]} />
              ) : (
                <div className='video-processing'>
                  <LoaderCircle className='spin' size={42} />
                  <strong>{videoStatusLabel(activeJob.status)}</strong>
                  <span>
                    {activeJob.progress != null
                      ? `${activeJob.progress}%`
                      : '任务已提交，正在等待上游返回结果'}
                  </span>
                  {activeJob.error && <small>{activeJob.error}</small>}
                </div>
              )}

              {videoUrls[activeJob.id] && (
                <>
                  <a
                    className='creative-button secondary'
                    href={videoUrls[activeJob.id]}
                    download={`newapi-video-${activeJob.id}.mp4`}
                  >
                    <Download size={16} /> 下载视频
                  </a>
                  <div className='video-remix-row'>
                    <input
                      value={remixPrompt}
                      onChange={(event) => setRemixPrompt(event.target.value)}
                      placeholder='描述要修改的内容...'
                    />
                    <button
                      className='creative-button secondary'
                      type='button'
                      disabled={remixBusy || !remixPrompt.trim()}
                      onClick={remixVideo}
                    >
                      <RotateCcw size={16} />
                      {remixBusy ? '提交中' : 'Remix'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<Play size={42} />}
              title='还没有视频任务'
              description='输入提示词后开始生成。'
            />
          )}
        </section>
      </div>

      <section className='creative-section video-history-section'>
        <div className='creative-section-title'>
          <div>
            <h2>视频历史</h2>
            <span>
              {jobs.length ? `${jobs.length} 个任务` : '本地保存的任务记录'}
            </span>
          </div>
        </div>

        {jobs.length === 0 ? (
          <EmptyState
            icon={<Video size={42} />}
            title='还没有历史任务'
            description='生成后任务会保存在当前浏览器。'
          />
        ) : (
          <div className='video-history-list'>
            {jobs.map((job) => (
              <div
                className={`video-history-item ${activeJob?.id === job.id ? 'active' : ''}`}
                key={job.id}
              >
                <button
                  className='video-history-select'
                  type='button'
                  onClick={() => setActiveId(job.id)}
                >
                  <span className='video-history-icon'>
                    {job.status === 'completed' ? (
                      <Play size={16} />
                    ) : (
                      <LoaderCircle
                        className={job.status === 'failed' ? '' : 'spin'}
                        size={16}
                      />
                    )}
                  </span>
                  <span className='video-history-copy'>
                    <strong>{job.prompt}</strong>
                    <small>
                      {job.model} · {job.size} · {videoStatusLabel(job.status)}
                    </small>
                  </span>
                </button>
                <span className='video-history-actions'>
                  <button
                    className='creative-icon-button small'
                    type='button'
                    onClick={() => pollJob(job.id)}
                    aria-label='刷新任务'
                  >
                    <RotateCcw size={15} />
                  </button>
                  <button
                    className='creative-icon-button small danger'
                    type='button'
                    onClick={() => removeJob(job.id)}
                    aria-label='删除本地记录'
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
