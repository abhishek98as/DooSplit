import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, icon, className = "", ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text-secondary mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`
              w-full h-11 px-4 
              ${icon ? "pl-10" : ""} 
              border-2 rounded-md text-body
              transition-all duration-200
              ${
                error
                  ? "border-error focus:border-error focus:ring-error/10"
                  : "border-neutral-200 focus:border-primary focus:ring-primary/10"
              }
              focus:outline-none focus:ring-4
              disabled:bg-neutral-50 disabled:text-neutral-400
              dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text
              ${className}
            `}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1 text-sm text-error">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1 text-sm text-neutral-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
