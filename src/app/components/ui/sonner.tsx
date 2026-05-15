"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";
import { 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  AlertTriangle, 
  X 
} from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-xl group-[.toaster]:rounded-xl group-[.toaster]:border group-[.toaster]:p-4 group-[.toaster]:gap-3 group-[.toaster]:font-sans group-[.toaster]:items-start",
          title: "group-[.toast]:font-semibold group-[.toast]:text-sm group-[.toast]:leading-none",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-sm group-[.toast]:leading-relaxed group-[.toast]:mt-1",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-md group-[.toast]:px-3 group-[.toast]:py-2 group-[.toast]:text-xs group-[.toast]:font-medium group-[.toast]:shadow-sm transition-transform active:scale-95",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-md group-[.toast]:px-3 group-[.toast]:py-2 group-[.toast]:text-xs group-[.toast]:font-medium transition-transform active:scale-95",
          error: 
            "group-[.toaster]:!bg-red-50 group-[.toaster]:!text-red-900 group-[.toaster]:!border-red-200 dark:group-[.toaster]:!bg-red-950/50 dark:group-[.toaster]:!text-red-200 dark:group-[.toaster]:!border-red-900",
          success: 
            "group-[.toaster]:!bg-green-50 group-[.toaster]:!text-green-900 group-[.toaster]:!border-green-200 dark:group-[.toaster]:!bg-green-950/50 dark:group-[.toaster]:!text-green-200 dark:group-[.toaster]:!border-green-900",
          warning: 
            "group-[.toaster]:!bg-amber-50 group-[.toaster]:!text-amber-900 group-[.toaster]:!border-amber-200 dark:group-[.toaster]:!bg-amber-950/50 dark:group-[.toaster]:!text-amber-200 dark:group-[.toaster]:!border-amber-900",
          info: 
            "group-[.toaster]:!bg-blue-50 group-[.toaster]:!text-blue-900 group-[.toaster]:!border-blue-200 dark:group-[.toaster]:!bg-blue-950/50 dark:group-[.toaster]:!text-blue-200 dark:group-[.toaster]:!border-blue-900",
        },
      }}
      icons={{
        success: <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />,
        info: <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
        warning: <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
        error: <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />,
      }}
      {...props}
    />
  );
};

export { Toaster };
