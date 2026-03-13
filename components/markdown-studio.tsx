"use client";

import { createElement, type CSSProperties, type ElementType, type ReactNode, useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { SAMPLE_MARKDOWN } from "@/lib/sample-markdown";
import { STORAGE_KEYS } from "@/lib/storage";

const REVEAL_VARIANTS = ["up", "left", "right", "depth"] as const;

function encodeShareSource(source: string) {
  if (typeof window === "undefined") {
    return "";
  }

  const bytes = new TextEncoder().encode(source);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeShareSource(encoded: string) {
  if (typeof window === "undefined") {
    return "";
  }

  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function buildShareUrl(source: string) {
  if (typeof window === "undefined") {
    return "";
  }

  const url = new URL(window.location.href);
  const encoded = encodeShareSource(source);

  if (encoded) {
    url.searchParams.set("md", encoded);
  } else {
    url.searchParams.delete("md");
  }

  return url.toString();
}

function formatFileSize(text: string) {
  const kilo = new Blob([text]).size / 1024;
  return `${kilo.toFixed(kilo > 99 ? 0 : 1)} KB`;
}

function revealClass(index: number) {
  return `reveal-item reveal-${REVEAL_VARIANTS[index % REVEAL_VARIANTS.length]}`;
}

function revealStyle(index: number) {
  return {
    ["--reveal-delay" as string]: `${Math.min(index * 55, 280)}ms`
  };
}

function RevealBlock({
  as,
  index,
  className,
  children,
  ...props
}: {
  as: ElementType;
  index: number;
  className?: string;
  children?: ReactNode;
} & Record<string, unknown>) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;

    if (!node) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      {
        threshold: 0.14,
        rootMargin: "0px 0px -10% 0px"
      }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  return createElement(
    as,
    {
      ...props,
      ref,
      className: `${revealClass(index)} ${visible ? "is-visible" : ""} ${className ?? ""}`.trim(),
      style: revealStyle(index) as CSSProperties
    },
    children
  );
}

export function MarkdownStudio() {
  const fileInputId = useId();
  const previewShellRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [draftSource, setDraftSource] = useState("");
  const [renderedSource, setRenderedSource] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Markdownまたはテキストを入力してください。");

  const hasDocument = renderedSource.trim().length > 0;

  useEffect(() => {
    setIsHydrated(true);
    const sharedParam = new URLSearchParams(window.location.search).get("md");
    const storedTheme = window.localStorage.getItem(STORAGE_KEYS.theme);
    const preferredDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextTheme = storedTheme === "dark" || (!storedTheme && preferredDark) ? "dark" : "light";
    const storedDraft = window.localStorage.getItem(STORAGE_KEYS.draft) ?? "";
    const storedRendered = window.localStorage.getItem(STORAGE_KEYS.rendered) ?? "";
    let nextDraft = storedDraft;
    let nextRendered = storedRendered;

    if (sharedParam) {
      try {
        const sharedSource = decodeShareSource(sharedParam);
        nextDraft = sharedSource;
        nextRendered = sharedSource;
      } catch {
        setStatusMessage("共有URLの復元に失敗しました。通常の入力モードで開いています。");
      }
    }

    setTheme(nextTheme);
    setDraftSource(nextDraft);
    setRenderedSource(nextRendered);
    if (sharedParam && nextRendered) {
      setStatusMessage("共有URLから文書を読み込みました。");
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEYS.theme, theme);
  }, [isHydrated, theme]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.draft, draftSource);
  }, [draftSource, isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.rendered, renderedSource);
  }, [renderedSource, isHydrated]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === previewShellRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleThemeToggle = () => {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  };

  const handleRender = () => {
    if (!draftSource.trim()) {
      setStatusMessage("入力欄が空です。サンプル読み込みも利用できます。");
      return;
    }

    setRenderedSource(draftSource);
    setStatusMessage("プレビューを更新しました。");
  };

  const handleLoadSample = () => {
    setDraftSource(SAMPLE_MARKDOWN);
    setRenderedSource(SAMPLE_MARKDOWN);
    setStatusMessage("サンプルMarkdownを読み込みました。");
  };

  const handleClear = () => {
    setDraftSource("");
    setRenderedSource("");
    setStatusMessage("入力内容をクリアしました。");
  };

  const handleFileContent = (content: string, name: string) => {
    setDraftSource(content);
    setRenderedSource(content);
    setStatusMessage(`${name} を読み込みました。${formatFileSize(content)} のテキストです。`);
  };

  const handleFile = (file: File | null) => {
    if (!file) {
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();

    if (!["md", "markdown", "txt"].includes(extension ?? "")) {
      setStatusMessage("対応ファイルは .md / .markdown / .txt です。");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      handleFileContent(content, file.name);
    };

    reader.onerror = () => {
      setStatusMessage("ファイルの読み込みに失敗しました。");
    };

    reader.readAsText(file, "utf-8");
  };

  const handleCopyShareUrl = async () => {
    if (!renderedSource.trim()) {
      setStatusMessage("共有する文書がありません。先にレンダリングしてください。");
      return;
    }

    try {
      const shareUrl = buildShareUrl(renderedSource);
      await navigator.clipboard.writeText(shareUrl);
      setStatusMessage("共有URLをクリップボードにコピーしました。");
    } catch {
      setStatusMessage("共有URLのコピーに失敗しました。");
    }
  };

  const handleNativeShare = async () => {
    if (!renderedSource.trim()) {
      setStatusMessage("共有する文書がありません。先にレンダリングしてください。");
      return;
    }

    if (typeof navigator.share !== "function") {
      setStatusMessage("このブラウザはネイティブ共有に対応していません。URLコピーをご利用ください。");
      return;
    }

    try {
      await navigator.share({
        title: "余白読本",
        text: "Markdownを美しい読書体験として共有します。",
        url: buildShareUrl(renderedSource)
      });
      setStatusMessage("共有ダイアログを開きました。");
    } catch {
      setStatusMessage("共有をキャンセルしたか、共有に失敗しました。");
    }
  };

  const handleFullscreenToggle = async () => {
    const shell = previewShellRef.current;

    if (!shell) {
      return;
    }

    try {
      if (document.fullscreenElement === shell) {
        await document.exitFullscreen();
        setStatusMessage("フルスクリーン表示を終了しました。");
      } else {
        await shell.requestFullscreen();
        setStatusMessage("フルスクリーン表示に切り替えました。");
      }
    } catch {
      setStatusMessage("この環境ではフルスクリーン切り替えが利用できませんでした。");
    }
  };

  let revealIndex = 0;
  const nextReveal = () => {
    const index = revealIndex;
    revealIndex += 1;
    return {
      className: revealClass(index),
      style: revealStyle(index)
    };
  };

  return (
    <main className="relative overflow-hidden px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="glass-panel relative overflow-hidden rounded-[2rem] px-6 py-6 sm:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.55),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(163,191,219,0.22),transparent_28%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center rounded-full border border-[var(--line)] bg-white/45 px-3 py-1 text-xs font-medium tracking-[0.18em] uppercase text-[var(--text-faint)] dark:bg-white/5">
                md.2bee.jp preview studio
              </div>
              <h1 className="font-sans text-3xl font-semibold tracking-[0.02em] text-[var(--text)] sm:text-5xl">
                余白読本
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--text-soft)] sm:text-base">
                Markdownを、読書したくなる美しい体験へ。貼り付けた文章やアップロードしたテキストを、
                静けさと品のある誌面へ整えます。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 self-start">
              <div className="rounded-full border border-[var(--line)] bg-white/55 px-4 py-2 text-xs text-[var(--text-faint)] dark:bg-white/5">
                読み込み・整形・共有をブラウザ内で完結
              </div>
              <button
                type="button"
                onClick={handleThemeToggle}
                className="rounded-full border border-[var(--line)] bg-white/70 px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:-translate-y-0.5 hover:shadow-float dark:bg-white/10"
                aria-label="ダークモード切り替え"
              >
                {theme === "light" ? "ダークモード" : "ライトモード"}
              </button>
            </div>
          </div>

          <div className="relative mt-6 grid gap-3 text-sm text-[var(--text-soft)] sm:grid-cols-3">
            {[
              "貼り付け・アップロード・ドラッグ&ドロップに対応",
              "雑誌のような余白とタイポグラフィで表示",
              "共有URLとフル画面読書に対応"
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-[var(--line)] bg-white/55 px-4 py-3 dark:bg-white/5"
              >
                {item}
              </div>
            ))}
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="glass-panel rounded-[2rem] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-sans text-xl font-semibold text-[var(--text)]">入力エリア</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--text-soft)]">
                  Markdownまたはプレーンテキストを入力してください。
                </p>
              </div>
              <div className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--text-faint)]">
                {draftSource.trim() ? `${draftSource.length.toLocaleString()} chars` : "empty"}
              </div>
            </div>

            <label htmlFor="markdown-input" className="sr-only">
              Markdown入力欄
            </label>
            <textarea
              id="markdown-input"
              value={draftSource}
              onChange={(event) => setDraftSource(event.target.value)}
              placeholder="ここにMarkdownを貼り付けてください。プレーンテキストでも大丈夫です。"
              className="mt-5 min-h-[280px] w-full rounded-[1.6rem] border border-[var(--line)] bg-white/75 px-4 py-4 text-sm leading-7 text-[var(--text)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-[var(--line-strong)] focus:shadow-[0_0_0_4px_rgba(120,145,170,0.12)] dark:bg-white/5"
            />

            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              className="sr-only"
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            />

            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                handleFile(event.dataTransfer.files?.[0] ?? null);
              }}
              className={`mt-4 rounded-[1.6rem] border border-dashed px-4 py-5 transition ${
                dragActive ? "dropzone-active" : "border-[var(--line)] bg-white/45 dark:bg-white/5"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text)]">ファイルをここへドロップ</p>
                  <p className="mt-1 text-xs leading-6 text-[var(--text-soft)]">
                    .md / .markdown / .txt をそのまま読み込めます。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full border border-[var(--line)] bg-white/75 px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:-translate-y-0.5 hover:shadow-float dark:bg-white/10"
                >
                  ファイルを選ぶ
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleRender}
                className="rounded-full bg-ink-800 px-5 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-ink-700 dark:bg-mist-200 dark:text-ink-900 dark:hover:bg-mist-100"
              >
                レンダリングする
              </button>
              <button
                type="button"
                onClick={handleLoadSample}
                className="rounded-full border border-[var(--line)] bg-white/70 px-5 py-3 text-sm font-medium text-[var(--text)] transition hover:-translate-y-0.5 hover:shadow-float dark:bg-white/10"
              >
                サンプルを読み込む
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="rounded-full border border-[var(--line)] bg-transparent px-5 py-3 text-sm font-medium text-[var(--text-soft)] transition hover:bg-white/50 dark:hover:bg-white/5"
              >
                クリア
              </button>
              <button
                type="button"
                onClick={handleCopyShareUrl}
                className="rounded-full border border-[var(--line)] bg-white/70 px-5 py-3 text-sm font-medium text-[var(--text)] transition hover:-translate-y-0.5 hover:shadow-float dark:bg-white/10"
              >
                共有URLをコピー
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-[var(--text-soft)]" aria-live="polite">
              {statusMessage}
            </p>
          </div>

          <div
            ref={previewShellRef}
            className={`glass-panel rounded-[2rem] p-3 transition-all duration-500 sm:p-4 lg:p-5 ${
              isFullscreen ? "fullscreen-shell h-screen overflow-y-auto rounded-none p-4 sm:p-6" : ""
            }`}
          >
            <div className="flex flex-col gap-4 border-b border-[var(--line)] px-3 pb-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-sans text-xl font-semibold text-[var(--text)]">プレビュー</h2>
                <p className="mt-1 text-sm text-[var(--text-soft)]">
                  レンダリング後の本文を、そのまま共有やフル画面読書に使えます。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--text-faint)]">
                  {hasDocument ? "ready to read" : "no document"}
                </div>
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--text)] transition hover:bg-white/55 dark:hover:bg-white/10"
                >
                  共有する
                </button>
                <button
                  type="button"
                  onClick={handleFullscreenToggle}
                  className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--text)] transition hover:bg-white/55 dark:hover:bg-white/10"
                >
                  {isFullscreen ? "フル画面を閉じる" : "フル画面で読む"}
                </button>
              </div>
            </div>

            <div
              className={`reading-surface relative min-h-[680px] rounded-[1.7rem] border border-white/40 p-5 shadow-halo transition-all duration-500 sm:p-8 lg:p-12 ${
                isFullscreen ? "min-h-[calc(100vh-8rem)] rounded-[1.2rem] lg:px-20 lg:py-16" : ""
              }`}
            >
              {hasDocument ? (
                <article className="prose-magazine mx-auto max-w-3xl" aria-label="Markdownプレビュー">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    rehypePlugins={[rehypeSanitize]}
                    skipHtml
                    components={{
                      h1: ({ children }) => {
                        nextReveal();
                        return (
                          <RevealBlock as="h1" index={revealIndex - 1}>
                            {children}
                          </RevealBlock>
                        );
                      },
                      h2: ({ children }) => {
                        nextReveal();
                        return (
                          <RevealBlock as="h2" index={revealIndex - 1}>
                            {children}
                          </RevealBlock>
                        );
                      },
                      h3: ({ children }) => {
                        nextReveal();
                        return (
                          <RevealBlock as="h3" index={revealIndex - 1}>
                            {children}
                          </RevealBlock>
                        );
                      },
                      p: ({ children }) => {
                        nextReveal();
                        return (
                          <RevealBlock as="p" index={revealIndex - 1}>
                            {children}
                          </RevealBlock>
                        );
                      },
                      a: ({ children, href }) => (
                        <a href={href} target="_blank" rel="noreferrer">
                          {children}
                        </a>
                      ),
                      ul: ({ children }) => {
                        nextReveal();
                        return (
                          <RevealBlock as="ul" index={revealIndex - 1}>
                            {children}
                          </RevealBlock>
                        );
                      },
                      ol: ({ children }) => {
                        nextReveal();
                        return (
                          <RevealBlock as="ol" index={revealIndex - 1}>
                            {children}
                          </RevealBlock>
                        );
                      },
                      blockquote: ({ children }) => {
                        nextReveal();
                        return (
                          <RevealBlock as="blockquote" index={revealIndex - 1}>
                            {children}
                          </RevealBlock>
                        );
                      },
                      pre: ({ children }) => {
                        nextReveal();
                        return (
                          <RevealBlock as="pre" index={revealIndex - 1}>
                            {children}
                          </RevealBlock>
                        );
                      },
                      table: ({ children }) => {
                        nextReveal();
                        return (
                          <RevealBlock as="div" index={revealIndex - 1} className="overflow-x-auto">
                            <table>{children}</table>
                          </RevealBlock>
                        );
                      },
                      hr: () => {
                        nextReveal();
                        return <RevealBlock as="hr" index={revealIndex - 1} />;
                      },
                      img: ({ src, alt }) => {
                        nextReveal();
                        return (
                          <RevealBlock as="img" index={revealIndex - 1} src={src ?? ""} alt={alt ?? ""} />
                        );
                      }
                    }}
                  >
                    {renderedSource}
                  </ReactMarkdown>
                </article>
              ) : (
                <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-2 py-16 text-center">
                  <div className="rounded-full border border-[var(--line)] bg-white/70 px-4 py-1 text-xs uppercase tracking-[0.22em] text-[var(--text-faint)] dark:bg-white/5">
                    Beautiful reading canvas
                  </div>
                  <h3 className="mt-5 font-sans text-3xl font-semibold text-[var(--text)]">
                    単なるビューアではなく、読書体験へ
                  </h3>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--text-soft)] sm:text-base">
                    Markdownを貼り付けるか、サンプルを読み込むと、見出し・引用・表・コード・画像まで
                    上品に整えた誌面として表示します。共有URLやフル画面読書にも対応しています。
                  </p>
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="mt-8 rounded-full bg-ink-800 px-5 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-ink-700 dark:bg-mist-200 dark:text-ink-900"
                  >
                    サンプルで試す
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="px-1 pb-4 pt-2">
          <div className="glass-panel flex flex-col gap-2 rounded-[1.8rem] px-6 py-5 text-sm text-[var(--text-soft)] sm:flex-row sm:items-center sm:justify-between">
            <p>余白読本は、ブラウザ内だけで文章を美しく整形するMarkdown読書スタジオです。</p>
            <p>md.2bee.jp 向けMVP / XSS対策あり / 共有URL対応</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
