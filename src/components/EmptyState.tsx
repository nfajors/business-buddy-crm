import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode; }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center mb-4">
        <Icon className="h-8 w-8 text-gold-dark" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
