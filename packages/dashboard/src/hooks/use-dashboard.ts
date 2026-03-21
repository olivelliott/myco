import { useQuery } from '@tanstack/react-query'
import { fetchDashboard } from '../lib/api'

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 30_000,
  })
}
