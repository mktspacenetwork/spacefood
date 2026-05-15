import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "./Button";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
          <div className="bg-destructive/10 p-4 rounded-full mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Algo deu errado</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            {this.state.error?.message || "Ocorreu um erro inesperado."}
          </p>
          <Button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="gap-2"
          >
            <RefreshCw size={16} />
            Recarregar Página
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
