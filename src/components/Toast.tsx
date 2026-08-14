import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

const typeConfig: Record<
  ToastType,
  { className: string; role: 'status' | 'alert'; icon: ReactNode }
> = {
  success: {
    className: 'glass-tile-success text-emerald-200',
    role: 'status',
    icon: <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-300" />,
  },
  info: {
    className: 'glass-tile-info text-sky-200',
    role: 'status',
    icon: <Info aria-hidden="true" className="h-4 w-4 shrink-0 text-sky-300" />,
  },
  warning: {
    className: 'glass-tile-warning text-amber-200',
    role: 'status',
    icon: <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-300" />,
  },
  error: {
    className: 'glass-tile-error text-rose-200',
    role: 'alert',
    icon: <XCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-rose-300" />,
  },
};

const dismissAfter: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 8000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'success') => {
      const id = nextId++;
      setItems((prev) => [...prev, { id, message, type }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), dismissAfter[type]),
      );
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-4 z-[200] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
        {items.map((item) => {
          const config = typeConfig[item.type];
          return (
            <div
              key={item.id}
              role={config.role}
              className={`pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-xl border bg-[rgba(16,13,40,0.92)] px-3 py-2.5 text-sm font-medium shadow-[0_24px_60px_-16px_rgba(2,1,10,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl animate-slide-in-top ${config.className}`}
            >
              {config.icon}
              <span className="flex-1">{item.message}</span>
              <button
                type="button"
                aria-label="إغلاق الإشعار"
                onClick={() => dismiss(item.id)}
                className="rounded-sm p-3.5 text-foreground-subtle transition-colors hover:bg-foreground/5 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
