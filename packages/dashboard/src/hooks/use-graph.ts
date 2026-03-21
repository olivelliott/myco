import { useQuery } from '@tanstack/react-query'
import { fetchGraph } from '../lib/api'

export function useGraph() {
  return useQuery({
    queryKey: ['graph'],
    queryFn: fetchGraph,
    refetchInterval: 60_000,
  })
}
