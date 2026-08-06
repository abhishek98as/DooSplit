import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  isLoading = false,
  className = "",
  children,
  disabled,
  ...props
}) => {
  const baseStyles =
    "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] touch-target";

  const variants = {
    primary: "bg-primary text-white hover:bg-primary-dark shadow-sm",
    secondary:
      "bg-white text-primary border-2 border-primary hover:bg-primary/10 dark:bg-dark-bg-secondary",
    destructive: "bg-error text-white hover:bg-error/90 shadow-sm",
    ghost:
      "bg-transparent text-neutral-700 dark:text-dark-text-secondary hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary",
    outline:
      "bg-white dark:bg-dark-bg-secondary text-neutral-700 dark:text-dark-text border border-neutral-300 dark:border-dark-border hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary",
  };

  const sizes = {
    sm: "min-h-11 h-11 px-4 text-sm",
    md: "min-h-11 h-11 px-6 text-button",
    lg: "min-h-12 h-12 px-8 text-button",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
};

export default Button;
