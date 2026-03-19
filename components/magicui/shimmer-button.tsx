import React, { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  className?: string;
  children?: React.ReactNode;
}

export const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  ({
    shimmerColor = "#ffffff",
    shimmerSize = "0.05em",
    shimmerDuration = "3s",
    borderRadius = "100px",
    background = "#1C1A14",
    className,
    children,
    ...props
  }, ref) => {
    return (
      <button
        style={{ "--spread": "90deg", "--shimmer-color": shimmerColor, "--radius": borderRadius, "--speed": shimmerDuration, "--cut": shimmerSize, "--bg": background } as CSSProperties}
        className={cn(
          "group relative z-0 flex cursor-pointer items-center justify-center gap-2 overflow-hidden whitespace-nowrap px-6 py-3 text-white [background:var(--bg)] [border-radius:var(--radius)]",
          "transition-all duration-300 ease-in-out hover:scale-[1.02] active:scale-[0.98]",
          "before:absolute before:inset-0 before:z-[-1] before:overflow-hidden before:[border-radius:var(--radius)]",
          "after:absolute after:inset-0 after:z-[-1] after:[background:linear-gradient(var(--spread),transparent_0%,var(--shimmer-color)_50%,transparent_100%)] after:[border-radius:var(--radius)] after:opacity-0 after:transition-opacity after:duration-500 hover:after:opacity-20",
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);
ShimmerButton.displayName = "ShimmerButton";
