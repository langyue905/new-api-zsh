/*
Copyright (C) 2023-2026 QuantumNous
*/
import { createFileRoute } from '@tanstack/react-router'

import { VideoPlayground } from '@/features/creative'

export const Route = createFileRoute('/_authenticated/video/')({
  component: VideoPlayground,
})
