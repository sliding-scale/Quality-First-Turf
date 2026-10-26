"use client";

import NextImage, { type ImageProps } from "next/image";
import { useEffect, useRef, useState, type ImgHTMLAttributes, type SyntheticEvent } from "react";

const maxDelayMs = 10000;

function waitFor(attempt: number) {
  return Math.min(700 * 2 ** Math.min(attempt, 4), maxDelayMs);
}

function withAttempt(src: string, attempt: number) {
  if (attempt === 0 || src.startsWith("blob:") || src.startsWith("data:")) return src;
  const joiner = src.includes("?") ? "&" : "?";
  return `${src}${joiner}retry=${attempt}`;
}

function useRetryingSrc(src: string) {
  const [attempt, setAttempt] = useState(0);
  const attemptRef = useRef(0);
  const timer = useRef<number | null>(null);
  const loaded = useRef(false);
  const failed = useRef(false);
  const alive = useRef(true);
  const seenSrc = useRef(src);

  attemptRef.current = attempt;

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimer();
    };
  }, []);

  useEffect(() => {
    if (seenSrc.current === src) return;
    seenSrc.current = src;
    loaded.current = false;
    failed.current = false;
    clearTimer();
    setAttempt(0);
  }, [src]);

  useEffect(() => {
    const onOnline = () => {
      if (!failed.current || loaded.current) return;
      clearTimer();
      setAttempt((current) => current + 1);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const schedule = () => {
    if (loaded.current || timer.current !== null) return;
    if (src.startsWith("blob:") || src.startsWith("data:")) return;
    const wait = waitFor(attemptRef.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (!alive.current || loaded.current) return;
      setAttempt((current) => current + 1);
    }, wait);
  };

  return {
    src: withAttempt(src, attempt),
    onLoad: () => {
      loaded.current = true;
      failed.current = false;
      clearTimer();
    },
    onError: () => {
      failed.current = true;
      schedule();
    },
  };
}

type RetryImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
};

function failedAlready(node: HTMLImageElement | null) {
  return node !== null && node.complete && node.naturalWidth === 0;
}

export default function RetryImage({ src, onLoad, onError, style, ...rest }: RetryImageProps) {
  const retry = useRetryingSrc(src);
  const [holding, setHolding] = useState(false);
  const nodeRef = useRef<HTMLImageElement>(null);
  const retryRef = useRef(retry);
  retryRef.current = retry;

  useEffect(() => {
    setHolding(false);
  }, [src]);

  useEffect(() => {
    if (!failedAlready(nodeRef.current)) return;
    setHolding(true);
    retryRef.current.onError();
  }, [retry.src]);

  return (
    <img
      {...rest}
      ref={nodeRef}
      src={retry.src}
      style={holding ? { ...style, opacity: 0 } : style}
      onLoad={(event) => {
        if (event.currentTarget.naturalWidth === 0) {
          setHolding(true);
          retry.onError();
          return;
        }
        setHolding(false);
        retry.onLoad();
        onLoad?.(event);
      }}
      onError={(event) => {
        setHolding(true);
        retry.onError();
        onError?.(event);
      }}
    />
  );
}

type RetryNextImageProps = Omit<ImageProps, "src"> & {
  src: string;
};

export function RetryNextImage({ src, onLoad, onError, style, ...rest }: RetryNextImageProps) {
  const retry = useRetryingSrc(src);
  const [holding, setHolding] = useState(false);
  const nodeRef = useRef<HTMLImageElement>(null);
  const retryRef = useRef(retry);
  retryRef.current = retry;

  useEffect(() => {
    setHolding(false);
  }, [src]);

  useEffect(() => {
    if (!failedAlready(nodeRef.current)) return;
    setHolding(true);
    retryRef.current.onError();
  }, [retry.src]);

  return (
    <NextImage
      {...rest}
      ref={nodeRef}
      src={retry.src}
      style={holding ? { ...style, opacity: 0 } : style}
      onLoad={(event: SyntheticEvent<HTMLImageElement>) => {
        if (event.currentTarget.naturalWidth === 0) {
          setHolding(true);
          retry.onError();
          return;
        }
        setHolding(false);
        retry.onLoad();
        onLoad?.(event);
      }}
      onError={(event: SyntheticEvent<HTMLImageElement>) => {
        setHolding(true);
        retry.onError();
        onError?.(event);
      }}
    />
  );
}

const backgroundPhotos = [
  ["--photo-turf", "/images/turf-landscape.webp"],
  ["--photo-onsite", "/images/onsite-landscape.webp"],
  ["--photo-confirm", "/images/confirmation-landscape.webp"],
] as const;

function keepTryingBackground(name: string, url: string) {
  let attempt = 0;
  let timer: number | null = null;
  let alive = true;
  let settled = false;
  const img = new window.Image();

  const run = () => {
    if (!alive || settled) return;
    const target = withAttempt(url, attempt);
    img.onload = () => {
      if (!alive) return;
      settled = true;
      document.documentElement.style.setProperty(name, `url("${target}")`);
    };
    img.onerror = () => {
      if (!alive || settled) return;
      const wait = waitFor(attempt);
      attempt += 1;
      timer = window.setTimeout(run, wait);
    };
    img.src = target;
  };

  const onOnline = () => {
    if (!alive || settled) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    attempt += 1;
    run();
  };

  run();
  window.addEventListener("online", onOnline);
  return () => {
    alive = false;
    if (timer !== null) window.clearTimeout(timer);
    img.onload = null;
    img.onerror = null;
    window.removeEventListener("online", onOnline);
  };
}

export function PhotoRetries() {
  useEffect(() => {
    const stop = backgroundPhotos.map(([name, url]) => keepTryingBackground(name, url));
    return () => stop.forEach((finish) => finish());
  }, []);
  return null;
}
