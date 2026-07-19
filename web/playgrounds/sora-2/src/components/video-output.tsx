'use client';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { VideoJob } from '@/types/video';
import { AlertCircle, CheckCircle, Clock, Copy, Check, Download, Loader2, Pause, Play, Sparkles } from 'lucide-react';
import * as React from 'react';

type VideoOutputProps = {
    job: VideoJob | null;
    videoSrc: string | null | undefined;
    thumbnailSrc?: string | null | undefined;
    isLoading: boolean;
    onSendToRemix?: (videoId: string) => void;
    onDownload?: (videoId: string) => void;
};

function ClickablePrompt({ prompt }: { prompt: string }) {
    const [copied, setCopied] = React.useState(false);

    const handleCopyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy prompt:', err);
        }
    };

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div
                    className='group cursor-pointer rounded-md bg-white/5 p-3 hover:bg-white/10 transition-colors'
                    onClick={handleCopyPrompt}
                >
                    <div className='flex items-start justify-between gap-2'>
                        <p className='text-xs text-white/70 line-clamp-2 flex-1'>
                            {prompt}
                        </p>
                        <div className='shrink-0 text-white/40 group-hover:text-white/60 transition-colors'>
                            {copied ? (
                                <Check className='h-3.5 w-3.5 text-green-400' />
                            ) : (
                                <Copy className='h-3.5 w-3.5' />
                            )}
                        </div>
                    </div>
                </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-black border border-white/20 text-white">
                <p>点击复制完整描述词</p>
            </TooltipContent>
        </Tooltip>
    );
}

export function VideoOutput({
    job,
    videoSrc,
    thumbnailSrc,
    isLoading,
    onSendToRemix,
    onDownload
}: VideoOutputProps) {
    const getStatusBadge = () => {
        if (!job) return null;

        switch (job.status) {
            case 'queued':
                return (
                    <div className='flex items-center gap-2 rounded-md bg-blue-500/20 px-3 py-1.5 text-sm text-blue-300'>
                        <Clock className='h-4 w-4' />
                        排队中
                    </div>
                );
            case 'in_progress':
                return (
                    <div className='flex items-center gap-2 rounded-md bg-yellow-500/20 px-3 py-1.5 text-sm text-yellow-300'>
                        <Loader2 className='h-4 w-4 animate-spin' />
                        处理中 {job.progress}%
                    </div>
                );
            case 'completed':
                return (
                    <div className='flex items-center gap-2 rounded-md bg-green-500/20 px-3 py-1.5 text-sm text-green-300'>
                        <CheckCircle className='h-4 w-4' />
                        已完成
                    </div>
                );
            case 'failed':
                return (
                    <div className='flex items-center gap-2 rounded-md bg-red-500/20 px-3 py-1.5 text-sm text-red-300'>
                        <AlertCircle className='h-4 w-4' />
                        失败
                    </div>
                );
        }
    };

    const handleDownload = () => {
        if (job && onDownload) {
            onDownload(job.id);
        }
    };

    const handleSendToRemix = () => {
        if (job && onSendToRemix) {
            onSendToRemix(job.id);
        }
    };

    const completedOutput =
        job?.status === 'completed' && typeof videoSrc === 'string'
            ? { job, videoSrc }
            : null;
    const isCompletedWithVideo = Boolean(completedOutput);

    return (
        <Card className='flex h-full w-full flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-black'>
            <CardHeader className='border-b border-white/10 pb-4'>
                <div className='flex items-center justify-between'>
                    <div>
                        <CardTitle className='text-lg font-medium text-white'>视频输出</CardTitle>
                        <CardDescription className='mt-1 text-white/60'>
                            生成的视频会显示在这里
                        </CardDescription>
                    </div>
                    {job && getStatusBadge()}
                </div>
            </CardHeader>
            <CardContent
                className={cn(
                    'flex min-h-0 flex-1 flex-col p-4',
                    isCompletedWithVideo ? 'items-stretch justify-start gap-4' : 'items-center justify-center'
                )}>
                {!job && !isLoading && (
                    <div className='flex flex-col items-center justify-center text-center'>
                        <Sparkles className='mb-4 h-12 w-12 text-white/20' />
                        <p className='text-white/40'>尚未开始视频任务</p>
                        <p className='mt-2 text-sm text-white/30'>
                            提交描述词以创建你的第一个视频
                        </p>
                    </div>
                )}

                {isLoading && !job && (
                    <div className='flex flex-col items-center justify-center text-center'>
                        <Loader2 className='mb-4 h-12 w-12 animate-spin text-white/60' />
                        <p className='text-white/60'>正在初始化视频生成……</p>
                    </div>
                )}

                {job && (job.status === 'queued' || job.status === 'in_progress') && (
                    <div className='w-full space-y-4'>
                        <div className='flex flex-col items-center justify-center text-center'>
                            <Loader2 className='mb-4 h-12 w-12 animate-spin text-white/60' />
                            <p className='text-lg text-white/80'>
                                {job.id.startsWith('temp_')
                                    ? '正在向 OpenAI 发送请求……'
                                    : job.status === 'queued'
                                        ? '视频正在排队……'
                                        : '正在生成视频……'}
                            </p>
                            <p className='mt-2 text-sm text-white/40'>
                                {job.id.startsWith('temp_')
                                    ? '正在初始化视频生成任务'
                                    : '根据视频时长和接口负载，可能需要几分钟'}
                            </p>
                        </div>

                        {job.status === 'in_progress' && !job.id.startsWith('temp_') && (
                            <div className='w-full space-y-2'>
                                <div className='flex justify-between text-sm text-white/60'>
                                    <span>进度</span>
                                    <span>{job.progress}%</span>
                                </div>
                                <div className='h-2 w-full overflow-hidden rounded-full bg-white/10'>
                                    <div
                                        className='h-full rounded-full bg-blue-500 transition-all duration-500 ease-out'
                                        style={{ width: `${job.progress}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {job.prompt && !job.id.startsWith('temp_') && (
                            <ClickablePrompt prompt={job.prompt} />
                        )}

                        {!job.id.startsWith('temp_') && (
                            <div className='mt-4 rounded-md bg-white/5 p-4'>
                                <p className='text-xs text-white/40'>
                                    <span className='font-medium text-white/60'>模型：</span> {job.model}
                                </p>
                                <p className='text-xs text-white/40'>
                                    <span className='font-medium text-white/60'>分辨率：</span> {job.size}
                                </p>
                                <p className='text-xs text-white/40'>
                                    <span className='font-medium text-white/60'>时长：</span> {job.seconds} 秒
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {completedOutput && (
                    <div className='flex h-full min-h-0 w-full flex-col gap-4'>
                        <CompletedVideoPlayer
                            key={completedOutput.job.id}
                            jobId={completedOutput.job.id}
                            videoSrc={completedOutput.videoSrc}
                            thumbnailSrc={thumbnailSrc}
                        />

                        <div className='grid shrink-0 grid-cols-2 gap-3'>
                            {onDownload && (
                                <Button
                                    onClick={handleDownload}
                                    variant='outline'
                                    className='border-white/20 bg-black text-white hover:bg-white/10 hover:text-white'>
                                    <Download className='mr-2 h-4 w-4' />
                                    下载视频
                                </Button>
                            )}
                            {onSendToRemix && (
                                <Button
                                    onClick={handleSendToRemix}
                                    variant='outline'
                                    className='border-white/20 bg-black text-white hover:bg-white/10 hover:text-white'>
                                    <Sparkles className='mr-2 h-4 w-4' />
                                    发送到混剪
                                </Button>
                            )}
                        </div>

                        {completedOutput.job.prompt && (
                            <ClickablePrompt prompt={completedOutput.job.prompt} />
                        )}

                        <div className='shrink-0 rounded-md bg-white/5 p-4'>
                            <p className='text-xs text-white/40'>
                                <span className='font-medium text-white/60'>模型：</span> {completedOutput.job.model}
                            </p>
                            <p className='text-xs text-white/40'>
                                <span className='font-medium text-white/60'>分辨率：</span> {completedOutput.job.size}
                            </p>
                            <p className='text-xs text-white/40'>
                                <span className='font-medium text-white/60'>时长：</span> {completedOutput.job.seconds} 秒
                            </p>
                        </div>
                    </div>
                )}

                {job && job.status === 'failed' && (
                    <div className='w-full space-y-4'>
                        <div className='flex flex-col items-center justify-center text-center'>
                            <AlertCircle className='mb-4 h-12 w-12 text-red-400' />
                            <p className='text-lg text-red-300'>视频生成失败</p>
                            {job.error && (
                                <div className='mt-4 max-w-md rounded-md border border-red-500/30 bg-red-500/10 p-4'>
                                    <p className='text-sm font-medium text-red-200'>错误：</p>
                                    <p className='mt-1 text-sm text-red-300'>{job.error.message}</p>
                                </div>
                            )}
                        </div>

                        <div className='rounded-md border border-red-500/20 bg-red-500/10 p-4'>
                            <p className='text-sm text-red-300'>
                                视频生成时遇到错误，可能原因包括：
                            </p>
                            <ul className='mt-2 list-inside list-disc space-y-1 text-xs text-red-300/80'>
                                <li>内容策略限制</li>
                                <li>输入参数无效</li>
                                <li>接口服务异常</li>
                            </ul>
                        </div>

                        {job.prompt && (
                            <ClickablePrompt prompt={job.prompt} />
                        )}

                        <div className='rounded-md bg-white/5 p-4'>
                            <p className='text-xs text-white/40'>
                                <span className='font-medium text-white/60'>模型：</span> {job.model}
                            </p>
                            <p className='text-xs text-white/40'>
                                <span className='font-medium text-white/60'>分辨率：</span> {job.size}
                            </p>
                            <p className='text-xs text-white/40'>
                                <span className='font-medium text-white/60'>时长：</span> {job.seconds} 秒
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

type CompletedVideoPlayerProps = {
    jobId: string;
    videoSrc: string;
    thumbnailSrc?: string | null | undefined;
};

function CompletedVideoPlayer({ jobId, videoSrc, thumbnailSrc }: CompletedVideoPlayerProps) {
    const videoRef = React.useRef<HTMLVideoElement | null>(null);
    const [isPlaying, setIsPlaying] = React.useState(false);
    const [hasInteracted, setHasInteracted] = React.useState(false);
    const [isHovering, setIsHovering] = React.useState(false);
    const [duration, setDuration] = React.useState(0);
    const [currentTime, setCurrentTime] = React.useState(0);

    React.useEffect(() => {
        const video = videoRef.current;
        setIsPlaying(false);
        setHasInteracted(false);
        setCurrentTime(0);
        setDuration(0);

        if (video) {
            video.pause();
            try {
                video.currentTime = 0;
            } catch (error) {
                console.warn('Unable to reset video currentTime:', error);
            }
        }
    }, [jobId, videoSrc]);

    const handleTogglePlayback = React.useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        if (video.paused || video.ended) {
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch((error) => {
                    console.error('Video playback failed to start:', error);
                });
            }
        } else {
            video.pause();
        }
    }, []);

    const handleSliderChange = React.useCallback(
        (value: number[]) => {
            if (value.length) {
                setCurrentTime(Math.min(value[0], duration));
            }
        },
        [duration]
    );

    const handleSliderCommit = React.useCallback(
        (value: number[]) => {
            const video = videoRef.current;
            if (!video || !value.length) return;

            const targetTime = Math.min(Math.max(value[0], 0), duration);
            video.currentTime = targetTime;
            setCurrentTime(targetTime);
            setHasInteracted(true);
        },
        [duration]
    );

    const formatTime = React.useCallback((timeInSeconds: number) => {
        if (!Number.isFinite(timeInSeconds) || timeInSeconds < 0) {
            return '0:00';
        }

        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = Math.floor(timeInSeconds % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, []);

    const showOverlay = !hasInteracted || isHovering || !isPlaying;
    const safeDuration = duration > 0 ? duration : 0.01;
    const formattedCurrentTime = formatTime(currentTime);
    const formattedDuration = formatTime(duration);

    return (
        <div className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/20 bg-black max-h-[60vh]'>
            <div
                className='relative flex min-h-0 flex-1 items-center justify-center bg-black'
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
                onFocus={() => setIsHovering(true)}
                onBlur={() => setIsHovering(false)}
            >
                <video
                    ref={videoRef}
                    src={videoSrc}
                    poster={thumbnailSrc || undefined}
                    className='h-full w-full max-h-full object-contain'
                    style={{ display: 'block', outline: 'none' }}
                    preload='auto'
                    playsInline
                    onClick={handleTogglePlayback}
                    onPlay={() => {
                        setIsPlaying(true);
                        setHasInteracted(true);
                    }}
                    onPause={() => setIsPlaying(false)}
                    onEnded={(event) => {
                        setIsPlaying(false);
                        setCurrentTime(event.currentTarget.duration || 0);
                    }}
                    onLoadedMetadata={(event) => {
                        setDuration(event.currentTarget.duration || 0);
                    }}
                    onTimeUpdate={(event) => {
                        setCurrentTime(event.currentTarget.currentTime);
                    }}
                    onError={(error) => console.error('Video playback error:', error)}
                />

                <button
                    type='button'
                    onClick={handleTogglePlayback}
                    className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 focus:outline-none ${
                        showOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                    aria-label={isPlaying ? '暂停视频' : '播放视频'}
                >
                    <span className='rounded-full bg-black/70 p-4 text-white shadow-lg backdrop-blur-sm'>
                        {isPlaying ? <Pause className='h-8 w-8' /> : <Play className='h-8 w-8' />}
                    </span>
                </button>
            </div>

            <div className='flex shrink-0 items-center gap-3 border-t border-white/10 px-4 py-3'>
                <span className='w-12 text-xs font-medium text-white/80 tabular-nums'>{formattedCurrentTime}</span>
                <Slider
                    value={[Math.min(currentTime, safeDuration)]}
                    min={0}
                    max={safeDuration}
                    step={0.1}
                    onValueChange={handleSliderChange}
                    onValueCommit={handleSliderCommit}
                    disabled={duration === 0}
                    className='flex-1'
                    aria-label='视频进度'
                />
                <span className='w-12 text-right text-xs font-medium text-white/60 tabular-nums'>
                    {formattedDuration}
                </span>
            </div>
        </div>
    );
}
