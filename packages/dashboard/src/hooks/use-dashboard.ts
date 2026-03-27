import { useQuery } from '@tanstack/react-query'
import { fetchDashboard, fetchGrowthStats } from '../lib/api'

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 30_000,
  })
}

export function useGrowthStats() {
  return useQuery({
    queryKey: ['growth-stats'],
    queryFn: fetchGrowthStats,
    refetchInterval: 60_000,
  })
}
