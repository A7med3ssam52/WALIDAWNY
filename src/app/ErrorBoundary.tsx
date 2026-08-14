import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled application error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-4" dir="rtl">
          <div className="glass-card w-full max-w-md p-6 text-center">
            <h1 className="text-lg font-bold text-foreground">حدث خطأ غير متوقع</h1>
            <p className="mt-2 text-sm text-foreground-muted">
              عذرًا، حدثت مشكلة أثناء عرض الصفحة. يرجى إعادة تحميل الصفحة للمتابعة.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-primary mt-4 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
