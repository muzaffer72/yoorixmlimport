import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  title: string;
  description?: string;
  lastUpdate?: string;
  onRefresh?: () => void;
  children?: React.ReactNode;
}

export default function Header({ 
  title, 
  description, 
  lastUpdate, 
  onRefresh, 
  children 
}: HeaderProps) {
  return (
    <header className="bg-card border-b border-border px-8 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          {description && (
            <p className="text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        <div className="flex items-center space-x-4">
          {lastUpdate && (
            <>
              <span className="text-sm text-muted-foreground">Son güncelleme:</span>
              <span className="text-sm font-medium">{lastUpdate}</span>
            </>
          )}
          {onRefresh && (
            <Button 
              onClick={onRefresh}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="button-refresh"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Yenile
            </Button>
          )}
          {children}
        </div>
      </div>
    </header>
  );
}
