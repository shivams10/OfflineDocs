"use client";

import { useEffect, useState } from "react";
import { LOGIN_FORM } from "@/constants/labels";

const TYPE_MS = 110;
const ERASE_MS = 55;
const HOLD_MS = 1400;

export function TypedWord() {

  const [text, setText] = useState<string>(LOGIN_FORM.typedWords[0]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let wordIndex = 0;
    let length = LOGIN_FORM.typedWords[0].length;
    let erasing = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const word = LOGIN_FORM.typedWords[wordIndex];

      if (!erasing && length === word.length) {
        erasing = true;
        timer = setTimeout(tick, HOLD_MS);
        return;
      }
      if (erasing && length === 0) {
        erasing = false;
        wordIndex = (wordIndex + 1) % LOGIN_FORM.typedWords.length;
      }

      length += erasing ? -1 : 1;
      setText(LOGIN_FORM.typedWords[wordIndex].slice(0, length));
      timer = setTimeout(tick, erasing ? ERASE_MS : TYPE_MS);
    };

    timer = setTimeout(tick, HOLD_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-primary">{text}</span>
      <span
        aria-hidden
        className="inline-block h-4 w-0.5 translate-y-0.5 animate-caret bg-primary"
      />
    </span>
  );
}
