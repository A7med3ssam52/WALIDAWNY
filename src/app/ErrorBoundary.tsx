import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled application error:', error, info);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message ?? '';
      const isChunkError =
        message.includes('Failed to fetch dynamically imported module') ||
        message.includes('ChunkLoadError') ||
        message.includes('Loading chunk') ||
        message.includes('Importing a module script failed');
      return (
        <div className="flex min-h-screen items-center justify-center p-4" dir="rtl">
          <div className="glass-card w-full max-w-md p-6 text-center">
            <h1 className="text-lg font-bold text-foreground">حدث خطأ غير متوقع</h1>
            <p className="mt-2 text-sm text-foreground-muted">
              {isChunkError
                ? 'فشل تحميل جزء من التطبيق. قد يكون الاتصال ضعيفًا أو تم تحديث المنصة. يرجى المحاولة مجددًا.'
                : 'عذرًا، حدثت مشكلة أثناء عرض الصفحة. يرجى إعادة تحميل الصفحة للمتابعة.'}
            </p>
            {isChunkError && this.state.error ? (
              <p className="mt-2 text-xs text-foreground-subtle break-all" dir="ltr">
                {this.state.error.message}
              </p>
            ) : null}
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center justify-center rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1"
              >
                إعادة المحاولة
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="btn-primary inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1"
              >
                إعادة تحميل الصفحة
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
