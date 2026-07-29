"use client";

import { useEffect } from "react";

const REVEAL_ROOT_SELECTOR = "[data-landing-reveal-root]";
const REVEAL_ITEM_SELECTOR = "[data-reveal]";

export default function ScrollReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(REVEAL_ROOT_SELECTOR);

    if (!root) {
      return;
    }

    const items = Array.from(
      root.querySelectorAll<HTMLElement>(REVEAL_ITEM_SELECTOR),
    );
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      items.forEach((item) => {
        item.dataset.revealVisible = "true";
      });
      return;
    }

    root.dataset.revealReady = "true";

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          (entry.target as HTMLElement).dataset.revealVisible = "true";
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -9% 0px",
      },
    );

    items.forEach((item) => observer.observe(item));

    return () => {
      observer.disconnect();
      delete root.dataset.revealReady;
    };
  }, []);

  return null;
}
