// Lazily loads the YouTube IFrame Player API and resolves once window.YT.Player
// is available. A plain <iframe src="..."> can't tell the parent page when a
// video ends, which the Discovery screen needs for autoplay-chaining — this
// is the smallest way to get that signal without adding a wrapper dependency.
//
// The actual YT.Player implementation is injected onto `window` by YouTube's
// own https://www.youtube.com/iframe_api script; the types below only
// describe the slice of that runtime object this app uses.

export interface YTPlayerOptions {
  videoId?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onStateChange?: (event: { data: number }) => void;
  };
}

export interface YTPlayer {
  loadVideoById(videoId: string): void;
  destroy(): void;
}

export interface YTNamespace {
  Player: new (elementOrId: HTMLElement | string, options: YTPlayerOptions) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }

    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve(window.YT!);
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });

  return apiPromise;
}
