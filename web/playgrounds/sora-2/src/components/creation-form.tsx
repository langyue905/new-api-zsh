'use client';

import type { VideoModel, VideoSeconds, VideoSize } from 'openai/resources/videos';
import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles } from 'lucide-react';
import * as React from 'react';

export type CreationFormData = {
    model: VideoModel;
    prompt: string;
    size: VideoSize;
    seconds: VideoSeconds;
    input_reference?: File;
};

type CreationFormProps = {
    onSubmit: (data: CreationFormData) => void;
    isLoading: boolean;
    currentMode: 'create' | 'remix';
    onModeChange: (mode: 'create' | 'remix') => void;
    model: VideoModel;
    setModel: React.Dispatch<React.SetStateAction<VideoModel>>;
    prompt: string;
    setPrompt: React.Dispatch<React.SetStateAction<string>>;
    size: VideoSize;
    setSize: React.Dispatch<React.SetStateAction<VideoSize>>;
    seconds: VideoSeconds;
    setSeconds: React.Dispatch<React.SetStateAction<VideoSeconds>>;
    inputReference: File | null;
    setInputReference: React.Dispatch<React.SetStateAction<File | null>>;
};

export function CreationForm({
    onSubmit,
    isLoading,
    currentMode,
    onModeChange,
    model,
    setModel,
    prompt,
    setPrompt,
    size,
    setSize,
    seconds,
    setSeconds,
    inputReference,
    setInputReference
}: CreationFormProps) {
    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData: CreationFormData = {
            model,
            prompt,
            size,
            seconds
        };
        if (inputReference) {
            formData.input_reference = inputReference;
        }
        onSubmit(formData);
    };

    const handleInputReferenceChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const maxSizeBytes = 100 * 1024 * 1024; // 100 MB
            if (file.size > maxSizeBytes) {
                alert(`File size exceeds 100 MB limit. Selected file is ${(file.size / (1024 * 1024)).toFixed(2)} MB.`);
                event.target.value = ''; // Clear the input
                return;
            }
            setInputReference(file);
        }
    };

    return (
        <Card className='flex h-full w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-black'>
            <CardHeader className='flex items-start justify-between border-b border-white/10 pb-4'>
                <div>
                    <div className='flex items-center'>
                        <CardTitle className='py-1 text-lg font-medium text-white'>Create Video</CardTitle>
                    </div>
                    <CardDescription className='mt-1 text-white/60'>
                        Generate a new video from a text prompt using Sora 2.
                    </CardDescription>
                </div>
                <ModeToggle currentMode={currentMode} onModeChange={onModeChange} />
            </CardHeader>
            <form onSubmit={handleSubmit} className='flex h-full flex-1 flex-col overflow-hidden'>
                <CardContent className='flex-1 space-y-5 overflow-y-auto p-4 lg:overflow-visible'>
                    <div className='space-y-1.5'>
                        <Label htmlFor='prompt' className='text-white'>
                            Prompt
                        </Label>
                        <Textarea
                            id='prompt'
                            placeholder='e.g., Wide shot of a child flying a red kite in a grassy park, golden hour sunlight, camera slowly pans upward.'
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            required
                            disabled={isLoading}
                            className='min-h-[100px] resize-none rounded-md border border-white/20 bg-black text-white placeholder:text-white/40 focus:border-white/50 focus:ring-white/50'
                        />
                        <p className='text-xs text-white/40'>
                            Describe: shot type, subject, action, setting, and lighting for best results.
                        </p>
                    </div>

                    <div className='space-y-2'>
                        <Label htmlFor='model-select' className='text-white'>
                            Model
                        </Label>
                        <Select
                            value={model}
                            onValueChange={(value) => {
                                const newModel = value as VideoModel;
                                setModel(newModel);
                                // If switching to sora-2 and currently have 1080p selected, switch to portrait 720p
                                if (newModel === 'sora-2' && (size === '1024x1792' || size === '1792x1024')) {
                                    setSize('720x1280');
                                }
                            }}
                            disabled={isLoading}>
                            <SelectTrigger
                                id='model-select'
                                className='rounded-md border border-white/20 bg-black text-white focus:border-white/50 focus:ring-white/50'>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className='border-white/20 bg-black text-white'>
                                <SelectItem value='sora-2' className='focus:bg-white/10 focus:text-white'>
                                    Sora 2
                                </SelectItem>
                                <SelectItem value='sora-2-pro' className='focus:bg-white/10 focus:text-white'>
                                    Sora 2 Pro
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className='space-y-2'>
                        <Label htmlFor='size-select' className='text-white'>
                            Size (Resolution)
                        </Label>
                        <Select value={size} onValueChange={(value) => setSize(value as VideoSize)} disabled={isLoading}>
                            <SelectTrigger
                                id='size-select'
                                className='rounded-md border border-white/20 bg-black text-white focus:border-white/50 focus:ring-white/50'>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className='border-white/20 bg-black text-white'>
                                <SelectItem value='720x1280' className='focus:bg-white/10 focus:text-white'>
                                    720x1280 (Portrait - 720p)
                                </SelectItem>
                                <SelectItem value='1280x720' className='focus:bg-white/10 focus:text-white'>
                                    1280x720 (Landscape - 720p)
                                </SelectItem>
                                <SelectSeparator className='bg-white/20' />
                                <SelectGroup>
                                    <SelectLabel className='px-2 py-1.5 text-xs font-medium text-white/60'>
                                        Sora 2 Pro Only
                                    </SelectLabel>
                                    <SelectItem
                                        value='1024x1792'
                                        className='focus:bg-white/10 focus:text-white disabled:opacity-50 disabled:cursor-not-allowed'
                                        disabled={model === 'sora-2'}>
                                        1024x1792 (Portrait - 1080p)
                                    </SelectItem>
                                    <SelectItem
                                        value='1792x1024'
                                        className='focus:bg-white/10 focus:text-white disabled:opacity-50 disabled:cursor-not-allowed'
                                        disabled={model === 'sora-2'}>
                                        1792x1024 (Landscape - 1080p)
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className='space-y-2'>
                        <Label className='text-white'>Duration</Label>
                        <RadioGroup
                            value={seconds}
                            onValueChange={(value) => setSeconds(value as VideoSeconds)}
                            disabled={isLoading}
                            className='flex gap-4'>
                            <div className='flex items-center space-x-2'>
                                <RadioGroupItem
                                    value='4'
                                    id='duration-4'
                                    className='border-white/40 text-white data-[state=checked]:border-white data-[state=checked]:text-white'
                                />
                                <Label htmlFor='duration-4' className='cursor-pointer text-base text-white/80'>
                                    4 seconds
                                </Label>
                            </div>
                            <div className='flex items-center space-x-2'>
                                <RadioGroupItem
                                    value='8'
                                    id='duration-8'
                                    className='border-white/40 text-white data-[state=checked]:border-white data-[state=checked]:text-white'
                                />
                                <Label htmlFor='duration-8' className='cursor-pointer text-base text-white/80'>
                                    8 seconds
                                </Label>
                            </div>
                            <div className='flex items-center space-x-2'>
                                <RadioGroupItem
                                    value='12'
                                    id='duration-12'
                                    className='border-white/40 text-white data-[state=checked]:border-white data-[state=checked]:text-white'
                                />
                                <Label htmlFor='duration-12' className='cursor-pointer text-base text-white/80'>
                                    12 seconds
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>

                    <div className='space-y-2'>
                        <Label htmlFor='input-reference' className='text-white'>
                            Input Reference (Optional)
                        </Label>
                        <Input
                            id='input-reference'
                            type='file'
                            accept='image/jpeg,image/png,image/webp,video/mp4'
                            onChange={handleInputReferenceChange}
                            disabled={isLoading}
                            className='flex h-10 cursor-pointer items-center rounded-md border border-white/20 bg-black px-3 text-white leading-tight file:mr-4 file:inline-flex file:h-full file:cursor-pointer file:items-center file:justify-center file:rounded-md file:border-0 file:bg-white/10 file:px-4 file:text-sm file:font-medium file:text-white hover:file:bg-white/20 focus:border-white/50 focus:ring-white/50'
                        />
                        {inputReference && (
                            <p className='text-xs text-white/60'>Selected: {inputReference.name}</p>
                        )}
                        <p className='text-xs text-white/40'>
                            Upload an image or video to use as the first frame. Must match the selected resolution.
                        </p>
                        <p className='text-xs text-white/40'>
                            Maximum file size is 100 MB. Video input is not available for all organizations.
                        </p>
                    </div>
                </CardContent>
                <CardFooter className='border-t border-white/10 p-4'>
                    <Button
                        type='submit'
                        disabled={isLoading || !prompt.trim()}
                        className='w-full bg-white text-black hover:bg-white/90 disabled:bg-white/40'>
                        {isLoading ? (
                            <>
                                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                                Creating Video...
                            </>
                        ) : (
                            <>
                                <Sparkles className='mr-2 h-4 w-4' />
                                Create Video
                            </>
                        )}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}
