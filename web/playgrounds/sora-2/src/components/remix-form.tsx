'use client';

import type { VideoModel, VideoSize } from 'openai/resources/videos';
import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles } from 'lucide-react';
import * as React from 'react';

export type RemixFormData = {
    source_video_id: string;
    prompt: string;
};

type RemixFormProps = {
    onSubmit: (data: RemixFormData) => void;
    isLoading: boolean;
    currentMode: 'create' | 'remix';
    onModeChange: (mode: 'create' | 'remix') => void;
    sourceVideoId: string;
    setSourceVideoId: React.Dispatch<React.SetStateAction<string>>;
    remixPrompt: string;
    setRemixPrompt: React.Dispatch<React.SetStateAction<string>>;
    completedVideos: Array<{
        id: string;
        prompt: string;
        model: VideoModel;
        size: VideoSize;
        seconds: number;
    }>;
    getVideoSrc: (id: string) => string | undefined;
};

export function RemixForm({
    onSubmit,
    isLoading,
    currentMode,
    onModeChange,
    sourceVideoId,
    setSourceVideoId,
    remixPrompt,
    setRemixPrompt,
    completedVideos,
    getVideoSrc
}: RemixFormProps) {
    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!sourceVideoId) {
            alert('请选择要混剪的源视频。');
            return;
        }
        const formData: RemixFormData = {
            source_video_id: sourceVideoId,
            prompt: remixPrompt
        };
        onSubmit(formData);
    };

    const selectedVideo = completedVideos.find((v) => v.id === sourceVideoId);
    const videoSrc = sourceVideoId ? getVideoSrc(sourceVideoId) : undefined;

    return (
        <Card className='flex h-full w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-black'>
            <CardHeader className='flex items-start justify-between border-b border-white/10 pb-4'>
                <div>
                    <div className='flex items-center'>
                        <CardTitle className='py-1 text-lg font-medium text-white'>混剪视频</CardTitle>
                    </div>
                    <CardDescription className='mt-1 text-white/60'>
                        对已有视频进行定向修改。
                    </CardDescription>
                </div>
                <ModeToggle currentMode={currentMode} onModeChange={onModeChange} />
            </CardHeader>
            <form onSubmit={handleSubmit} className='flex h-full flex-1 flex-col overflow-hidden'>
                <CardContent className='flex-1 space-y-5 overflow-y-auto p-4 lg:overflow-visible'>
                    <div className='space-y-2'>
                        <Label htmlFor='source-video-select' className='text-white'>
                            源视频
                        </Label>
                        <Select value={sourceVideoId} onValueChange={setSourceVideoId} disabled={isLoading}>
                            <SelectTrigger
                                id='source-video-select'
                                className='rounded-md border border-white/20 bg-black text-white focus:border-white/50 focus:ring-white/50'>
                                <SelectValue placeholder='选择已完成的视频……' />
                            </SelectTrigger>
                            <SelectContent className='border-white/20 bg-black text-white'>
                                {completedVideos.length === 0 ? (
                                    <SelectItem value='none' disabled className='text-white/40'>
                                        暂无已完成的视频
                                    </SelectItem>
                                ) : (
                                    completedVideos.map((video) => (
                                        <SelectItem
                                            key={video.id}
                                            value={video.id}
                                            className='focus:bg-white/10 focus:text-white'>
                                            <div className='flex flex-col'>
                                                <span className='font-medium'>
                                                    {video.prompt.length > 50
                                                        ? video.prompt.substring(0, 50) + '...'
                                                        : video.prompt}
                                                </span>
                                                <span className='text-xs text-white/40'>
                                                    {video.model} • {video.size} • {video.seconds} 秒
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                        <p className='text-xs text-white/40'>
                            从历史记录中选择一个视频作为混剪基础。
                        </p>
                    </div>

                    {selectedVideo && videoSrc && (
                        <div className='space-y-2'>
                            <Label className='text-white'>源视频预览</Label>
                            <div className='overflow-hidden rounded-lg border border-white/20'>
                                <video
                                    src={videoSrc}
                                    controls
                                    className='w-full bg-black'
                                    style={{ maxHeight: '300px' }}
                                />
                            </div>
                            <div className='rounded-md bg-white/5 p-3'>
                                <p className='text-xs text-white/60'>
                                    <span className='font-medium text-white/80'>原始描述词：</span>{' '}
                                    {selectedVideo.prompt}
                                </p>
                                <p className='mt-1 text-xs text-white/40'>
                                    {selectedVideo.model} • {selectedVideo.size} • {selectedVideo.seconds} 秒
                                </p>
                            </div>
                        </div>
                    )}

                    <div className='space-y-1.5'>
                        <Label htmlFor='remix-prompt' className='text-white'>
                            混剪描述词
                        </Label>
                        <Textarea
                            id='remix-prompt'
                            placeholder='例如：将色彩改为青绿色、沙色和铁锈色，并加入温暖的逆光。'
                            value={remixPrompt}
                            onChange={(e) => setRemixPrompt(e.target.value)}
                            required
                            disabled={isLoading || !sourceVideoId}
                            className='min-h-[100px] resize-none rounded-md border border-white/20 bg-black text-white placeholder:text-white/40 focus:border-white/50 focus:ring-white/50'
                        />
                        <p className='text-xs text-white/40'>
                            请描述一个明确的单项修改。改动越小，越能保留原视频效果。
                        </p>
                    </div>

                    {!sourceVideoId && completedVideos.length > 0 && (
                        <div className='rounded-md border border-white/20 bg-white/5 p-4 text-center'>
                            <p className='text-sm text-white/60'>请先在上方选择源视频，再开始混剪。</p>
                        </div>
                    )}

                    {completedVideos.length === 0 && (
                        <div className='rounded-md border border-white/20 bg-white/5 p-4 text-center'>
                            <p className='text-sm text-white/60'>
                                暂无已完成的视频。请先创建视频，再回到这里进行混剪。
                            </p>
                        </div>
                    )}
                </CardContent>
                <CardFooter className='border-t border-white/10 p-4'>
                    <Button
                        type='submit'
                        disabled={isLoading || !remixPrompt.trim() || !sourceVideoId}
                        className='w-full bg-white text-black hover:bg-white/90 disabled:bg-white/40'>
                        {isLoading ? (
                            <>
                                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                                正在创建混剪……
                            </>
                        ) : (
                            <>
                                <Sparkles className='mr-2 h-4 w-4' />
                                混剪视频
                            </>
                        )}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}
