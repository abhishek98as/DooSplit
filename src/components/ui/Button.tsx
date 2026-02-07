import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive" | "ghost";
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
    "inline-flex items-center justify-center font-medium rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";

  const variants = {
    primary: "bg-primary text-white hover:bg-primary-dark shadow-sm",
    secondary:
      "bg-white text-primary border-2 border-primary hover:bg-primary/10",
    destructive: "bg-error text-white hover:bg-error/90 shadow-sm",
    ghost: "bg-transparent text-neutral-700 hover:bg-neutral-100",
  };

  const sizes = {
    sm: "h-9 px-3 text-sm",
    md: "h-11 px-6 text-button",
    lg: "h-12 px-8 text-button",
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
