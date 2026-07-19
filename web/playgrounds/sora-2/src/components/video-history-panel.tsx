'use client';

import type { VideoMetadata, VideoJob } from '@/types/video';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
    DollarSign,
    Sparkles as SparklesIcon,
    HardDrive,
    Database,
    Trash2,
    RefreshCw,
    Loader2
} from 'lucide-react';
import * as React from 'react';

type VideoHistoryPanelProps = {
    history: VideoMetadata[];
    activeJobs?: Map<string, VideoJob>;
    onSelectVideo: (item: VideoMetadata) => void;
    onClearHistory: () => void;
    getVideoSrc: (id: string) => string | undefined;
    getThumbnailSrc?: (id: string) => string | undefined;
    onDeleteItem?: (item: VideoMetadata) => void;
};

export function VideoHistoryPanel({
    history,
    activeJobs,
    onSelectVideo,
    onClearHistory,
    getVideoSrc,
    getThumbnailSrc,
    onDeleteItem
}: VideoHistoryPanelProps) {
    const [openCostDialogId, setOpenCostDialogId] = React.useState<string | null>(null);
    const [isTotalCostDialogOpen, setIsTotalCostDialogOpen] = React.useState(false);

    const { totalCost, totalVideos, successfulVideos } = React.useMemo(() => {
        let cost = 0;
        let videos = 0;
        let successful = 0;
        history.forEach((item) => {
            // Only count cost for non-failed videos
            if (item.costDetails && item.status !== 'failed') {
                cost += item.costDetails.totalCost;
                successful += 1;
            }
            // Count all videos (including failed)
            videos += 1;
        });

        return { totalCost: Math.round(cost * 100) / 100, totalVideos: videos, successfulVideos: successful };
    }, [history]);

    const averageCost = successfulVideos > 0 ? totalCost / successfulVideos : 0;

    const handlePreviewEnter = React.useCallback((video: HTMLVideoElement) => {
        const tryPlay = () => {
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch((error) => {
                    console.warn('Preview playback failed:', error);
                });
            }
        };

        video.dataset.hoverPreview = 'true';
        video.currentTime = 0;

        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            tryPlay();
            return;
        }

        const handleCanPlay = () => {
            video.removeEventListener('canplay', handleCanPlay);
            if (video.dataset.hoverPreview === 'true') {
                tryPlay();
            }
        };

        video.addEventListener('canplay', handleCanPlay, { once: true });
        video.load();
    }, []);

    const handlePreviewLeave = React.useCallback((video: HTMLVideoElement) => {
        video.dataset.hoverPreview = 'false';
        video.pause();
        try {
            video.currentTime = 0;
        } catch (error) {
            console.warn('Unable to reset preview time:', error);
        }
    }, []);

    return (
        <Card className='flex h-full w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-black'>
            <CardHeader className='flex flex-row items-center justify-between gap-4 border-b border-white/10 px-4 py-3'>
                <div className='flex items-center gap-2'>
                    <CardTitle className='text-lg font-medium text-white'>历史记录</CardTitle>
                    {totalCost > 0 && (
                        <Dialog open={isTotalCostDialogOpen} onOpenChange={setIsTotalCostDialogOpen}>
                            <DialogTrigger asChild>
                                <button
                                    className='mt-0.5 flex items-center gap-1 rounded-full bg-green-600/80 px-1.5 py-0.5 text-[12px] text-white transition-colors hover:bg-green-500/90'
                                    aria-label='显示总费用摘要'>
                                    总费用：${totalCost.toFixed(2)}
                                </button>
                            </DialogTrigger>
                            <DialogContent className='border-neutral-700 bg-neutral-900 text-white sm:max-w-[450px]'>
                                <DialogHeader>
                                    <DialogTitle className='text-white'>总费用摘要</DialogTitle>
                                    <DialogDescription className='sr-only'>
                                        历史记录中所有已生成视频的预估总费用摘要。
                                    </DialogDescription>
                                </DialogHeader>
                                <div className='space-y-1 pt-1 text-xs text-neutral-400'>
                                    <p>Sora 2 价格：</p>
                                    <ul className='list-disc pl-4'>
                                        <li>sora-2（720p）：$0.10/秒</li>
                                        <li>sora-2-pro（720p）：$0.30/秒</li>
                                        <li>sora-2-pro（1080p）：$0.50/秒</li>
                                    </ul>
                                </div>
                                <div className='space-y-2 py-4 text-sm text-neutral-300'>
                                    <div className='flex justify-between'>
                                        <span>生成视频总数：</span> <span>{totalVideos.toLocaleString()}</span>
                                    </div>
                                    <div className='flex justify-between'>
                                        <span>平均每个视频费用：</span> <span>${averageCost.toFixed(2)}</span>
                                    </div>
                                    <hr className='my-2 border-neutral-700' />
                                    <div className='flex justify-between font-medium text-white'>
                                        <span>预估总费用：</span>
                                        <span>${totalCost.toFixed(2)}</span>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button
                                            type='button'
                                            variant='secondary'
                                            size='sm'
                                            className='bg-neutral-700 text-neutral-200 hover:bg-neutral-600'>
                                            关闭
                                        </Button>
                                    </DialogClose>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
                {history.length > 0 && (
                    <Button
                        variant='ghost'
                        size='sm'
                        onClick={onClearHistory}
                        className='h-auto rounded-md px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white'>
                        清空
                    </Button>
                )}
            </CardHeader>
            <CardContent className='flex-grow overflow-y-auto p-4'>
                {history.length === 0 ? (
                    <div className='flex h-full items-center justify-center text-white/40'>
                        <p>生成的视频会显示在这里。</p>
                    </div>
                ) : (
                    <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'>
                        {[...history].map((item) => {
                            const thumbnailUrl = getThumbnailSrc ? getThumbnailSrc(item.id) : undefined;
                            const videoUrl = getVideoSrc(item.id);
                            const originalStorageMode = item.storageModeUsed || 'fs';
                            const job = activeJobs?.get(item.id);
                            const isProcessing = item.status === 'processing' || (job && (job.status === 'queued' || job.status === 'in_progress'));
                            const isFailed = item.status === 'failed' || (job && job.status === 'failed');

                            return (
                                <div key={item.id} className='flex flex-col'>
                                    <div className='group relative'>
                                        <button
                                            onClick={() => onSelectVideo(item)}
                                            className='relative block aspect-square w-full overflow-hidden rounded-t-md border border-white/20 transition-all duration-150 group-hover:border-white/40 focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black focus:outline-none'
                                            aria-label={`View video from ${new Date(item.timestamp).toLocaleString()}`}>
                                            {isProcessing ? (
                                                <div className='flex h-full w-full flex-col items-center justify-center bg-neutral-900'>
                                                    <Loader2 className='h-8 w-8 animate-spin text-white/40 mb-2' />
                                                    <span className='text-xs text-white/60'>
                                                         {job?.status === 'queued' ? '排队中' : `${item.progress || job?.progress || 0}%`}
                                                    </span>
                                                </div>
                                            ) : isFailed ? (
                                                <div className='flex h-full w-full flex-col items-center justify-center bg-red-950 text-red-400 p-2'>
                                                    <span className='text-xs font-semibold'>失败</span>
                                                    {item.error && (
                                                        <span className='text-[10px] text-red-300 mt-1 text-center line-clamp-2'>
                                                            {item.error}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : videoUrl && item.status !== 'failed' ? (
                                                <video
                                                    src={videoUrl}
                                                    poster={thumbnailUrl}
                                                    className='h-full w-full object-cover'
                                                    muted
                                                    preload='metadata'
                                                    playsInline
                                                    onMouseEnter={(event) => handlePreviewEnter(event.currentTarget)}
                                                    onMouseLeave={(event) => handlePreviewLeave(event.currentTarget)}
                                                />
                                            ) : (
                                                <div className='flex h-full w-full items-center justify-center bg-neutral-800 text-neutral-500'>
                                                    ?
                                                </div>
                                            )}
                                            <div
                                                className={cn(
                                                    'pointer-events-none absolute top-1 left-1 z-10 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] text-white',
                                                    item.mode === 'remix' ? 'bg-orange-600/80' : 'bg-blue-600/80'
                                                )}>
                                                {item.mode === 'remix' ? (
                                                    <RefreshCw size={12} />
                                                ) : (
                                                    <SparklesIcon size={12} />
                                                )}
                                                {item.mode === 'remix' ? '混剪' : '创建'}
                                            </div>
                                            <div className='pointer-events-none absolute bottom-1 left-1 z-10 flex items-center gap-1'>
                                                <div className='flex items-center gap-1 rounded-full border border-white/10 bg-neutral-900/80 px-1 py-0.5 text-[11px] text-white/70'>
                                                    {originalStorageMode === 'fs' ? (
                                                        <HardDrive size={12} className='text-neutral-400' />
                                                    ) : (
                                                        <Database size={12} className='text-blue-400' />
                                                    )}
                                                    <span>{originalStorageMode === 'fs' ? '文件' : '数据库'}</span>
                                                </div>
                                                <div className='flex items-center gap-1 rounded-full border border-white/10 bg-neutral-900/80 px-1 py-0.5 text-[11px] text-white/70'>
                                                    <span>{item.seconds} 秒</span>
                                                </div>
                                            </div>
                                        </button>
                                        {item.costDetails && item.status !== 'failed' && (
                                            <Dialog
                                                open={openCostDialogId === item.id}
                                                onOpenChange={(isOpen) => !isOpen && setOpenCostDialogId(null)}>
                                                <DialogTrigger asChild>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenCostDialogId(item.id);
                                                        }}
                                                        className='absolute top-1 right-1 z-20 flex items-center gap-0.5 rounded-full bg-green-600/80 px-1.5 py-0.5 text-[11px] text-white transition-colors hover:bg-green-500/90'
                                                        aria-label='显示费用明细'>
                                                        <DollarSign size={12} />
                                                        {item.costDetails.totalCost.toFixed(2)}
                                                    </button>
                                                </DialogTrigger>
                                                <DialogContent className='border-neutral-700 bg-neutral-900 text-white sm:max-w-[450px]'>
                                                    <DialogHeader>
                                                        <DialogTitle className='text-white'>费用明细</DialogTitle>
                                                        <DialogDescription className='sr-only'>
                                                            此视频生成任务的预估费用明细。
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <div className='space-y-2 py-4 text-sm text-neutral-300'>
                                                        <div className='flex justify-between'>
                                                            <span>模型：</span> <span>{item.costDetails.model}</span>
                                                        </div>
                                                        <div className='flex justify-between'>
                                                            <span>分辨率：</span>{' '}
                                                            <span>{item.costDetails.resolution}</span>
                                                        </div>
                                                        <div className='flex justify-between'>
                                                            <span>时长：</span> <span>{item.costDetails.duration} 秒</span>
                                                        </div>
                                                        <div className='flex justify-between'>
                                                            <span>每秒价格：</span>{' '}
                                                            <span>${item.costDetails.pricePerSecond.toFixed(2)}</span>
                                                        </div>
                                                        <hr className='my-2 border-neutral-700' />
                                                        <div className='flex justify-between font-medium text-white'>
                                                            <span>总费用：</span>
                                                            <span>${item.costDetails.totalCost.toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                    <DialogFooter>
                                                        <DialogClose asChild>
                                                            <Button
                                                                type='button'
                                                                variant='secondary'
                                                                size='sm'
                                                                className='bg-neutral-700 text-neutral-200 hover:bg-neutral-600'>
                                                                关闭
                                                            </Button>
                                                        </DialogClose>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        )}
                                        {onDeleteItem && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const message = item.status === 'failed'
                                                        ? '确定要从历史记录中删除这个失败的请求吗？'
                                                        : '确定要删除这个视频吗？这会将它从本地存储和 OpenAI 服务器永久删除。';
                                                    if (confirm(message)) {
                                                        onDeleteItem(item);
                                                    }
                                                }}
                                                className='absolute bottom-1 right-1 z-20 flex items-center gap-0.5 rounded-full bg-red-600/80 p-1 text-white transition-colors hover:bg-red-500/90'
                                                aria-label='删除视频'>
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </div>
                                    <div className='rounded-b-md border border-t-0 border-white/20 bg-neutral-900/50 p-2'>
                                        <p className='line-clamp-1 text-xs text-white/70' title={item.prompt}>
                                            {item.prompt}
                                        </p>
                                        <div className='mt-1 flex items-center justify-between text-[10px] text-white/40'>
                                            <span>{item.model}</span>
                                            <span>{item.size}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
