import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
}

const buttonVariants = ({ variant = "primary", size = "md" }: { variant?: string; size?: string } = {}) => {
  return cn(
    "inline-flex items-center justify-center rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-95",
    {
      "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20":
        variant === "primary",
      "bg-secondary text-secondary-foreground hover:bg-secondary/80":
        variant === "secondary",
      "border border-input bg-background hover:bg-accent hover:text-accent-foreground":
        variant === "outline",
      "hover:bg-accent hover:text-accent-foreground": variant === "ghost",
      "bg-destructive text-destructive-foreground hover:bg-destructive/90":
        variant === "destructive",
      "h-9 px-3 text-xs": size === "sm",
      "h-11 px-6 py-2 text-sm": size === "md",
      "h-14 px-8 text-base": size === "lg",
      "h-10 w-10 p-0": size === "icon",
    }
  );
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-95",
          {
            "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20":
              variant === "primary",
            "bg-secondary text-secondary-foreground hover:bg-secondary/80":
              variant === "secondary",
            "border border-input bg-background hover:bg-accent hover:text-accent-foreground":
              variant === "outline",
            "hover:bg-accent hover:text-accent-foreground": variant === "ghost",
            "bg-destructive text-destructive-foreground hover:bg-destructive/90":
              variant === "destructive",
            "h-9 px-3 text-xs": size === "sm",
            "h-11 px-6 py-2 text-sm": size === "md",
            "h-14 px-8 text-base": size === "lg",
            "h-10 w-10 p-0": size === "icon",
          },
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };