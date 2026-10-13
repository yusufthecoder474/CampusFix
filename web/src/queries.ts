import {
  useMutation,
  useQuery,
  useQueryClient,
  QueryClient,
} from "@tanstack/react-query";
import type { ApiClient, Role } from "./api";
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 30000,
        gcTime: 300000,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}
export function useRequests(
  api: ApiClient,
  role: Role,
  query: { status: string; location: string; page: number; limit: number },
) {
  return useQuery({
    queryKey: ["requests", api.scope, role, query],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        page: String(query.page),
        limit: String(query.limit),
      });
      if (query.status) params.set("status", query.status);
      if (query.location) params.set("location", query.location);
      return api.list(params.toString(), signal);
    },
  });
}
export function useRequestDetails(api: ApiClient, id: string) {
  return useQuery({
    queryKey: ["request", id, api.scope],
    queryFn: ({ signal }) => api.detail(id, signal),
  });
}
export function useRequestHistory(api: ApiClient, id: string, page: number) {
  return useQuery({
    queryKey: ["history", id, api.scope, page],
    queryFn: ({ signal }) => api.history(id, page, signal),
  });
}
export function useTechnicians(api: ApiClient, page: number, enabled: boolean) {
  return useQuery({
    queryKey: ["technicians", api.scope, page],
    queryFn: ({ signal }) => api.technicians(page, signal),
    enabled,
  });
}
export async function invalidateRequest(client: QueryClient, id: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ["requests"] }),
    client.invalidateQueries({ queryKey: ["request", id] }),
    client.invalidateQueries({ queryKey: ["history", id] }),
  ]);
}
export function useCreateRequest(api: ApiClient) {
  const client = useQueryClient(),
    scope = api.scope;
  return useMutation({
    mutationFn: (input: {
      title: string;
      description: string;
      location: string;
    }) => api.create(input),
    onSuccess: async (result) => {
      if (api.scope !== scope) return;
      client.setQueryData(["request", result.request.id, scope], result);
      await client.invalidateQueries({ queryKey: ["requests"] });
    },
  });
}
export function useWorkflowMutation(api: ApiClient, id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      action: string;
      expectedVersion: number;
      note?: string;
      technicianId?: string;
    }) => api.act(id, input),
    onSuccess: () => invalidateRequest(client, id),
    onError: async (error) => {
      if ("status" in error && error.status === 409)
        await invalidateRequest(client, id);
    },
  });
}
