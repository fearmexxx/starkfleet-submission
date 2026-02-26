'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastOptions {
    message: string;
    type?: ToastType;
    duration?: number;
}

interface ToastContextType {
    showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<(ToastOptions & { id: number })[]>([]);

    const showToast = useCallback(({ message, type = 'info', duration = 3000 }: ToastOptions) => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message, type, duration }]);

        if (duration > 0) {
            setTimeout(() => {
                setToasts((prev) => prev.filter((toast) => toast.id !== id));
            }, duration);
        }
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* Toast Container */}
            <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`pointer-events-auto p-4 min-w-[300px] rounded-sm border backdrop-blur-md shadow-lg transform transition-all duration-300 ease-in-out ${toast.type === 'error'
                            ? 'bg-red-500/20 border-red-500/50 text-red-100'
                            : toast.type === 'success'
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-100'
                                : 'bg-blue-500/20 border-blue-500/50 text-blue-100'
                            }`}
                        onClick={() => removeToast(toast.id)}
                    >
                        <div className="flex justify-between items-start">
                            <p className="font-mono text-sm uppercase tracking-wider pr-4">{toast.message}</p>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeToast(toast.id);
                                }}
                                className="text-white/50 hover:text-white transition-colors"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
