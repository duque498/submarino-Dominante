import { useCallback, useRef, useState } from "react";

interface UseDragReorderProps {
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export function useDragReorder({ onReorder }: UseDragReorderProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => (e: React.DragEvent) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // Set a transparent drag image
    const el = e.currentTarget as HTMLElement;
    e.dataTransfer.setDragImage(el, 0, 0);
  }, []);

  const handleDragOver = useCallback((index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      onReorder(dragIndex, overIndex);
    }
    setDragIndex(null);
    setOverIndex(null);
  }, [dragIndex, overIndex, onReorder]);

  const getDragProps = useCallback((index: number) => ({
    draggable: true,
    onDragStart: handleDragStart(index),
    onDragOver: handleDragOver(index),
    onDragEnd: handleDragEnd,
    className: `${dragIndex === index ? "opacity-40" : ""} ${overIndex === index && dragIndex !== index ? "border-primary/50 border-t-2" : ""}`,
  }), [dragIndex, overIndex, handleDragStart, handleDragOver, handleDragEnd]);

  return { getDragProps, dragIndex, overIndex };
}
