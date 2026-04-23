"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, placeBelow: false });

  const show = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const placeBelow = spaceAbove < 200;
    setCoords({
      top: placeBelow ? rect.bottom + 8 : rect.top - 8,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 310)),
      placeBelow
    });
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        className="cursor-help"
      >
        {children}
      </span>
      {visible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: coords.placeBelow ? coords.top : undefined,
              bottom: coords.placeBelow ? undefined : window.innerHeight - coords.top,
              left: coords.left,
              zIndex: 9999
            }}
            className="w-[300px] rounded-lg border border-industrial-600 bg-industrial-900 p-3 shadow-2xl"
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}
