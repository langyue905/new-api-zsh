/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your
option) any later version.
*/

/* oxlint-disable react/iframe-missing-sandbox -- The embedded apps are trusted same-origin builds that need their original browser capabilities. */

type EmbeddedPlaygroundProps = {
  src: string
  title: string
}

function EmbeddedPlayground(props: EmbeddedPlaygroundProps) {
  return (
    <main className='bg-background flex min-h-0 flex-1 overflow-hidden'>
      <iframe
        className='h-full min-h-0 w-full border-0'
        src={props.src}
        title={props.title}
        allow='clipboard-read; clipboard-write; fullscreen'
      />
    </main>
  )
}

export function ImagePlayground() {
  const search = new URLSearchParams({
    apiUrl: `${window.location.origin}/v1`,
    apiMode: 'images',
    model: 'gpt-image-2',
    profileName: 'New API',
  })

  return (
    <EmbeddedPlayground
      src={`/playgrounds/image/?${search.toString()}`}
      title='GPT Image Playground'
    />
  )
}

export function VideoPlayground() {
  return (
    <EmbeddedPlayground
      src='/playgrounds/video/'
      title='Sora 2 Playground'
    />
  )
}
