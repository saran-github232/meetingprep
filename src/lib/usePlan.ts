import { useEffect, useState } from "react";

export function usePlan(): "free" | "pro" | null {
  const [plan, setPlan] = useState<"free" | "pro" | null>(null);
  useEffect(() => {
    window.api.plan.get().then(setPlan);
  }, []);
  return plan;
}
