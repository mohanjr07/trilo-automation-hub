import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkflowPeople } from "@/lib/workflowPeople";

type Person = { id: string; full_name: string };

/** Everyone's names (for the signature block) + the authorizer choices (Settings → Workflow people). */
export function useFormPeople() {
  const wp = useWorkflowPeople();
  const { data: people = [] } = useQuery({
    queryKey: ["form-people"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_active_profiles");
      if (error) throw error;
      return (data ?? []) as Person[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const names: Record<string, string> = Object.fromEntries(people.map((p) => [p.id, p.full_name]));
  const authorizers: Person[] = wp.people("authorizer");
  return { people, names, authorizers, wp };
}
