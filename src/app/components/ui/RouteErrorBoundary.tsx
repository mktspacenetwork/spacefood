import React from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "./Button";

interface RouteErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface RouteErrorBoundaryProps {
  children: React.ReactNode;
  routeName?: string;
}

export class RouteErrorBoundary extends React.Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`RouteErrorBoundary [${this.props.routeName || 'unknown'}] caught:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
          <div className="bg-destructive/10 p-4 rounded-full mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            Algo deu errado{this.props.routeName ? ` em ${this.props.routeName}` : ""}
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md text-sm">
            {this.state.error?.message || "Ocorreu um erro inesperado nesta página."}
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = "/";
              }}
              className="gap-2"
            >
              <Home size={16} />
              Voltar ao Início
            </Button>
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: null });
              }}
              className="gap-2"
            >
              <RefreshCw size={16} />
              Tentar Novamente
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
