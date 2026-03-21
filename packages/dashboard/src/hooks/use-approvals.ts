import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApprovals, resolveApproval } from '../lib/api.js'
import { toast } from 'sonner'

export function useApprovals() {
  return useQuery({
    queryKey: ['approvals'],
    queryFn: fetchApprovals,
    refetchInterval: 30_000,
  })
}

export function useResolveApproval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      status,
      edited_content,
    }: {
      id: string
      status: 'approved' | 'rejected'
      edited_content?: string
    }) => resolveApproval(id, status, edited_content),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['approvals'] })
      const previous = queryClient.getQueryData(['approvals'])
      queryClient.setQueryData(['approvals'], (old: { items: Array<{ id: string }> } | undefined) => {
        if (!old) return old
        return { ...old, items: old.items.filter((i) => i.id !== vars.id) }
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(['approvals'], context?.previous)
      toast.error('Action failed \u2014 changes rolled back')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onSuccess: (_data, vars) => {
      if (vars.status === 'approved') toast.success('Approved')
      else toast('Rejected')
    },
  })
}
