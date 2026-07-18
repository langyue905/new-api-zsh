/*
Copyright (C) 2023-2026 QuantumNous
*/
import { createFileRoute } from '@tanstack/react-router'

import { ImagePlayground } from '@/features/creative'

export const Route = createFileRoute('/_authenticated/image/')({
  component: ImagePlayground,
})
