/*
Copyright (C) 2023-2026 QuantumNous
*/
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/console/video/')({
  beforeLoad: () => {
    throw redirect({ to: '/video' })
  },
})
