/*
Copyright (C) 2023-2026 QuantumNous
*/
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/console/image/')({
  beforeLoad: () => {
    throw redirect({ to: '/image' })
  },
})
