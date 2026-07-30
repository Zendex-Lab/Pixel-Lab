import { createFileRoute } from '@tanstack/react-router'
import AuthConfirmPage from '../../components/AuthConfirmPage'

export const Route = createFileRoute('/auth/confirm')({
  component: AuthConfirmPage,
})
