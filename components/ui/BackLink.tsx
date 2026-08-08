"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

export function BackLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const [clicked, setClicked] = useState(false);

  return (
    <Link
      href={href}
      aria-disabled={clicked}
      onClick={(e) => {
        if (clicked) {
          e.preventDefault();
          return;
        }
        setClicked(true);
      }}
      className={`${className ?? ""} ${clicked ? "pointer-events-none opacity-60" : ""}`}
    >
      {children}
    </Link>
  );
}
