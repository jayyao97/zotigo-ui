import { createContext } from "react";
export { createdCompletionTrigger } from "../../shared/completionTriggerDisplay";

export const CompletionTriggerNavigation = createContext<((id: string) => void) | null>(null);
