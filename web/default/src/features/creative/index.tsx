/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your
option) any later version.
*/

import {
  Download,
  Image as ImageIcon,
  KeyRound,
  LoaderCircle,
  Sparkles,
  Video,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Main } from '@/components/layout'

type CreativeSettings = {
  endpoint: string
  apiKey: string
}

type ImageResult = {
  id: string
  url: string
  prompt: string
}

type VideoJob = {
  id: string
  prompt: string
  status: string
  progress?: number | null
  error?: string
  url?: string
}

const IMAGE_SETTINGS_KEY = 'newapi.default.creative.image.settings'
const VIDEO_SETTINGS_KEY = 'newapi.default.creative.video.settings'

function getSettings(key: string): CreativeSettings {
  if (typeof window === 'undefined') return { endpoint: '', apiKey: '' }
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) || '{}')
    return {
      endpoint: stored.endpoint || window.location.origin,
      apiKey: stored.apiKey || '',
    }
  } catch {
    return { endpoint: window.location.origin, apiKey: '' }
  }
}

function saveSettings(key: string, value: CreativeSettings) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

function endpoint(settings: CreativeSettings, path: string) {
  return `${settings.endpoint.replace(/\/$/, '')}/v1${path}`
}

function headers(settings: CreativeSettings, json = false) {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${settings.apiKey.trim()}`,
  }
}

async function readError(response: Response) {
  const body = await response.json().catch(() => ({}))
  return body?.error?.message || body?.message || `请求失败（${response.status}）`
}

function SettingsPanel({
  settings,
  onChange,
}: {
  settings: CreativeSettings
  onChange: (next: CreativeSettings) => void
}) {
  return (
    <details className='rounded-xl border bg-card p-4 shadow-sm' open={!settings.apiKey}>
      <summary className='flex cursor-pointer list-none items-center gap-2 font-medium'>
        <KeyRound className='size-4' />
        API 连接配置
        <span className='text-muted-foreground ml-auto text-xs'>密钥仅保存在当前浏览器</span>
      </summary>
      <div className='mt-4 grid gap-3 md:grid-cols-2'>
        <label className='grid gap-1 text-sm'>
          API 地址
          <input
            className='h-9 rounded-md border bg-background px-3 outline-none focus:ring-2 focus:ring-ring'
            value={settings.endpoint}
            onChange={(event) => onChange({ ...settings, endpoint: event.target.value })}
            placeholder='http://127.0.0.1:3000'
          />
        </label>
        <label className='grid gap-1 text-sm'>
          API 密钥
          <input
            className='h-9 rounded-md border bg-background px-3 outline-none focus:ring-2 focus:ring-ring'
            type='password'
            value={settings.apiKey}
            onChange={(event) => onChange({ ...settings, apiKey: event.target.value })}
            placeholder='sk-...'
          />
        </label>
      </div>
    </details>
  )
}

function CreativeHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <header className='mb-5 flex items-start gap-3'>
      <div className='bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl'>
        {icon}
      </div>
      <div>
        <p className='text-muted-foreground text-xs font-medium tracking-widest uppercase'>
          New API Creative
        </p>
        <h1 className='text-2xl font-semibold tracking-tight'>{title}</h1>
        <p className='text-muted-foreground mt-1 text-sm'>{description}</p>
      </div>
    </header>
  )
}

function ErrorMessage({ message }: { message: string }) {
  if (!message) return null
  return <div className='border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm'>{message}</div>
}

export function ImagePlayground() {
  const [settings, setSettings] = useState(() => getSettings(IMAGE_SETTINGS_KEY))
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('gpt-image-1')
  const [size, setSize] = useState('auto')
  const [quality, setQuality] = useState('auto')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<ImageResult[]>([])

  const updateSettings = (next: CreativeSettings) => {
    setSettings(next)
    saveSettings(IMAGE_SETTINGS_KEY, next)
  }

  const generate = async () => {
    if (!prompt.trim()) return setError('请先输入图像提示词。')
    if (!settings.apiKey.trim()) return setError('请先在上方配置 API 密钥。')
    setBusy(true)
    setError('')
    try {
      const response = await fetch(endpoint(settings, '/images/generations'), {
        method: 'POST',
        headers: headers(settings, true),
        body: JSON.stringify({ model, prompt: prompt.trim(), size, quality, n: 1 }),
      })
      if (!response.ok) throw new Error(await readError(response))
      const body = await response.json()
      const created = (body.data || [])
        .map((item: { url?: string; b64_json?: string }, index: number) => ({
          id: `${Date.now()}-${index}`,
          prompt: prompt.trim(),
          url: item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ''),
        }))
        .filter((item: ImageResult) => item.url)
      if (!created.length) throw new Error('接口返回成功，但没有图像结果。')
      setResults((previous) => [...created, ...previous].slice(0, 12))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '图像生成失败。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Main className='overflow-y-auto p-4 md:p-6'>
      <div className='mx-auto w-full max-w-7xl space-y-5'>
        <CreativeHeader icon={<ImageIcon className='size-5' />} title='图像生成' description='输入提示词，调用兼容 OpenAI Images API 的图像模型。' />
        <SettingsPanel settings={settings} onChange={updateSettings} />
        <section className='rounded-xl border bg-card p-4 shadow-sm md:p-6'>
          <div className='grid gap-4 lg:grid-cols-[1fr_160px_160px_auto] lg:items-end'>
            <label className='grid gap-1 text-sm lg:col-span-1'>
              图像提示词
              <textarea className='min-h-24 rounded-md border bg-background p-3 outline-none focus:ring-2 focus:ring-ring' value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder='描述你想生成的图像...' />
            </label>
            <label className='grid gap-1 text-sm'>
              模型
              <select className='h-9 rounded-md border bg-background px-2' value={model} onChange={(event) => setModel(event.target.value)}>
                <option>gpt-image-1</option><option>dall-e-3</option><option>dall-e-2</option>
              </select>
            </label>
            <label className='grid gap-1 text-sm'>
              尺寸
              <select className='h-9 rounded-md border bg-background px-2' value={size} onChange={(event) => setSize(event.target.value)}>
                <option value='auto'>自动</option><option value='1024x1024'>1024x1024</option><option value='1536x1024'>1536x1024</option><option value='1024x1536'>1024x1536</option>
              </select>
            </label>
            <button className='bg-primary text-primary-foreground inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium disabled:opacity-50' type='button' onClick={generate} disabled={busy}>
              {busy ? <LoaderCircle className='size-4 animate-spin' /> : <Sparkles className='size-4' />}
              {busy ? '生成中' : '生成图像'}
            </button>
          </div>
          <div className='mt-3 flex items-center gap-3 text-sm'>
            <label className='text-muted-foreground'>质量 <select className='ml-1 rounded border bg-background px-2 py-1' value={quality} onChange={(event) => setQuality(event.target.value)}><option>auto</option><option>low</option><option>medium</option><option>high</option></select></label>
            <span className='text-muted-foreground'>生成结果只保存在当前页面，不会写入服务器文件。</span>
          </div>
        </section>
        <ErrorMessage message={error} />
        <section className='space-y-3'>
          <div className='flex items-center justify-between'><h2 className='text-lg font-semibold'>生成结果</h2><span className='text-muted-foreground text-sm'>{results.length} 个结果</span></div>
          {results.length === 0 ? <div className='text-muted-foreground rounded-xl border border-dashed p-12 text-center text-sm'>生成的图像会显示在这里</div> : <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>{results.map((item) => <article className='overflow-hidden rounded-xl border bg-card shadow-sm' key={item.id}><img className='aspect-square w-full object-cover' src={item.url} alt={item.prompt} /><div className='flex items-center gap-2 p-3'><p className='text-muted-foreground line-clamp-2 flex-1 text-xs'>{item.prompt}</p><a className='hover:bg-muted rounded p-2' href={item.url} download={`newapi-image-${item.id}.png`} aria-label='下载图像'><Download className='size-4' /></a></div></article>)}</div>}
        </section>
      </div>
    </Main>
  )
}

export function VideoPlayground() {
  const [settings, setSettings] = useState(() => getSettings(VIDEO_SETTINGS_KEY))
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('sora-2')
  const [size, setSize] = useState('720x1280')
  const [seconds, setSeconds] = useState('4')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [jobs, setJobs] = useState<VideoJob[]>([])
  const [activeUrl, setActiveUrl] = useState('')

  const updateSettings = (next: CreativeSettings) => {
    setSettings(next)
    saveSettings(VIDEO_SETTINGS_KEY, next)
  }

  const poll = async (id: string) => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 3500))
      try {
        const response = await fetch(endpoint(settings, `/videos/${encodeURIComponent(id)}`), { headers: headers(settings) })
        if (!response.ok) throw new Error(await readError(response))
        const body = await response.json()
        const data = body.data || body
        const status = data.status || 'processing'
        setJobs((previous) => previous.map((job) => job.id === id ? { ...job, status, progress: data.progress ?? null, error: data.error?.message || '' } : job))
        if (status === 'completed') {
          const content = await fetch(endpoint(settings, `/videos/${encodeURIComponent(id)}/content`), { headers: headers(settings) })
          if (content.ok) setActiveUrl(URL.createObjectURL(await content.blob()))
          return
        }
        if (['failed', 'cancelled'].includes(status)) return
      } catch (pollError) {
        setJobs((previous) => previous.map((job) => job.id === id ? { ...job, error: pollError instanceof Error ? pollError.message : '状态查询失败' } : job))
        return
      }
    }
  }

  useEffect(() => () => { if (activeUrl) URL.revokeObjectURL(activeUrl) }, [activeUrl])

  const createVideo = async () => {
    if (!prompt.trim()) return setError('请先输入视频提示词。')
    if (!settings.apiKey.trim()) return setError('请先在上方配置 API 密钥。')
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('model', model); form.append('prompt', prompt.trim()); form.append('size', size); form.append('seconds', seconds)
      const response = await fetch(endpoint(settings, '/videos'), { method: 'POST', headers: headers(settings), body: form })
      if (!response.ok) throw new Error(await readError(response))
      const body = await response.json()
      const data = body.data || body
      const id = data.id || data.video_id || data.task_id
      if (!id) throw new Error('接口返回成功，但没有视频任务 ID。')
      setJobs((previous) => [{ id, prompt: prompt.trim(), status: data.status || 'queued' }, ...previous].slice(0, 10))
      void poll(id)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '视频生成失败。')
    } finally {
      setBusy(false)
    }
  }

  const activeJob = useMemo(() => jobs[0], [jobs])

  return (
    <Main className='overflow-y-auto p-4 md:p-6'>
      <div className='mx-auto w-full max-w-7xl space-y-5'>
        <CreativeHeader icon={<Video className='size-5' />} title='视频生成' description='使用 Sora 2 兼容接口创建视频任务并自动轮询结果。' />
        <SettingsPanel settings={settings} onChange={updateSettings} />
        <section className='rounded-xl border bg-card p-4 shadow-sm md:p-6'>
          <label className='grid gap-1 text-sm'>视频提示词<textarea className='mt-1 min-h-32 rounded-md border bg-background p-3 outline-none focus:ring-2 focus:ring-ring' value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder='描述镜头、主体、动作、场景和风格...' /></label>
          <div className='mt-4 grid gap-3 sm:grid-cols-3'>
            <label className='grid gap-1 text-sm'>模型<select className='h-9 rounded-md border bg-background px-2' value={model} onChange={(event) => setModel(event.target.value)}><option>sora-2</option><option>sora-2-pro</option></select></label>
            <label className='grid gap-1 text-sm'>尺寸<select className='h-9 rounded-md border bg-background px-2' value={size} onChange={(event) => setSize(event.target.value)}><option value='720x1280'>720x1280（竖屏）</option><option value='1280x720'>1280x720（横屏）</option></select></label>
            <label className='grid gap-1 text-sm'>时长<select className='h-9 rounded-md border bg-background px-2' value={seconds} onChange={(event) => setSeconds(event.target.value)}><option>4</option><option>8</option><option>12</option></select></label>
          </div>
          <button className='bg-primary text-primary-foreground mt-4 inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium disabled:opacity-50' type='button' onClick={createVideo} disabled={busy}>{busy ? <LoaderCircle className='size-4 animate-spin' /> : <Sparkles className='size-4' />}{busy ? '提交中' : '生成视频'}</button>
        </section>
        <ErrorMessage message={error} />
        {activeJob && <section className='rounded-xl border bg-card p-4 shadow-sm'><div className='flex items-center justify-between'><h2 className='font-semibold'>任务状态</h2><span className='text-muted-foreground text-sm'>{activeJob.status}{activeJob.progress == null ? '' : ` · ${activeJob.progress}%`}</span></div><p className='text-muted-foreground mt-2 text-sm'>{activeJob.prompt}</p>{activeJob.error && <p className='text-destructive mt-2 text-sm'>{activeJob.error}</p>}{activeUrl && <video className='mt-4 max-h-[70vh] w-full rounded-lg bg-black' controls src={activeUrl} />}{activeUrl && <a className='text-primary mt-3 inline-flex items-center gap-2 text-sm' href={activeUrl} download='newapi-video.mp4'><Download className='size-4' />下载视频</a>}</section>}
        {!activeJob && <div className='text-muted-foreground rounded-xl border border-dashed p-12 text-center text-sm'>提交视频任务后，进度和结果会显示在这里</div>}
      </div>
    </Main>
  )
}
