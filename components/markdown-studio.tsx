"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { SAMPLE_MARKDOWN } from "@/lib/sample-markdown";
import {
  hashSource,
  Marker,
  MarkerColor,
  MarkerDocuments,
  readStoredJson,
  STORAGE_KEYS
} from "@/lib/storage";

const REVEAL_VARIANTS = ["up", "left", "right", "depth"] as const;
const MARKER_COLORS: Array<{ value: MarkerColor; label: string; swatch: string }> = [
  { value: "yellow", label: "黄", swatch: "bg-glow-sand" },
  { value: "green", label: "緑", swatch: "bg-glow-mint" },
  { value: "blue", label: "青", swatch: "bg-glow-sky" },
  { value: "pink", label: "桃", swatch: "bg-glow-rose" }
];

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

type ToolbarState = {
  start: number;
  end: number;
  top: number;
  left: number;
  hasOverlap: boolean;
} | null;

function mergeWithoutOverlaps(markers: Marker[], nextMarker: Marker) {
  const filtered = markers.filter(
    (marker) => marker.end <= nextMarker.start || marker.start >= nextMarker.end
  );

  return [...filtered, nextMarker].sort((left, right) => left.start - right.start);
}

function removeMarkerSpans(root: HTMLElement) {
  const markers = root.querySelectorAll("span[data-marker-id]");

  markers.forEach((element) => {
    const parent = element.parentNode;

    while (element.firstChild) {
      parent?.insertBefore(element.firstChild, element);
    }

    parent?.removeChild(element);
  });

  root.normalize();
}

function wrapMarker(root: HTMLElement, marker: Marker) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Array<{ node: Text; start: number; end: number }> = [];
  let cursor = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const length = node.textContent?.length ?? 0;

    textNodes.push({ node, start: cursor, end: cursor + length });
    cursor += length;
  }

  const overlaps = textNodes.filter(
    ({ end, start }) => marker.start < end && marker.end > start && end > start
  );

  overlaps.reverse().forEach(({ node, start }) => {
    const text = node.textContent ?? "";
    const innerStart = Math.max(0, marker.start - start);
    const innerEnd = Math.min(text.length, marker.end - start);

    if (innerStart >= innerEnd) {
      return;
    }

    let middle = node;

    if (innerStart > 0) {
      middle = middle.splitText(innerStart);
    }

    if (innerEnd - innerStart < middle.textContent!.length) {
      middle.splitText(innerEnd - innerStart);
    }

    const span = document.createElement("span");
    span.className = "marker-highlight";
    span.dataset.markerId = marker.id;
    span.dataset.color = marker.color;
    span.dataset.animated = "true";
    middle.parentNode?.insertBefore(span, middle);
    span.appendChild(middle);

    window.setTimeout(() => {
      span.dataset.animated = "false";
    }, 1200);
  });
}

function applyMarkers(root: HTMLElement, markers: Marker[]) {
  removeMarkerSpans(root);
  markers.forEach((marker) => wrapMarker(root, marker));
}

function getSelectionOffsets(root: HTMLElement, selection: Selection) {
  if (selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);

  if (!root.contains(range.commonAncestorContainer) || range.collapsed) {
    return null;
  }

  const startRange = range.cloneRange();
  startRange.selectNodeContents(root);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = range.cloneRange();
  endRange.selectNodeContents(root);
  endRange.setEnd(range.endContainer, range.endOffset);

  const start = startRange.toString().length;
  const end = endRange.toString().length;

  if (start === end) {
    return null;
  }

  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
    rect: range.getBoundingClientRect()
  };
}

function formatFileSize(text: string) {
  const kilo = new Blob([text]).size / 1024;
  return `${kilo.toFixed(kilo > 99 ? 0 : 1)} KB`;
}

function assignRevealVariants(root: HTMLElement) {
  const elements = Array.from(root.children) as HTMLElement[];

  elements.forEach((element, index) => {
    const variant = REVEAL_VARIANTS[(index * 7 + element.textContent!.length) % REVEAL_VARIANTS.length];
    element.dataset.reveal = variant;
    element.dataset.revealed = "false";
    element.style.setProperty("--reveal-delay", `${Math.min(index * 55, 280)}ms`);
  });
}

export function MarkdownStudio() {
  const fileInputId = useId();
  const previewRef = useRef<HTMLElement | null>(null);
  const previewShellRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [draftSource, setDraftSource] = useState("");
  const [renderedSource, setRenderedSource] = useState("");
  const [markerDocuments, setMarkerDocuments] = useState<MarkerDocuments>({});
  const [toolbar, setToolbar] = useState<ToolbarState>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Markdownまたはテキストを入力してください。");

  const documentId = useMemo(() => hashSource(renderedSource), [renderedSource]);
  const markers = markerDocuments[documentId] ?? [];
  const hasDocument = renderedSource.trim().length > 0;

  useEffect(() => {
    setIsHydrated(true);
    const sharedParam = new URLSearchParams(window.location.search).get("md");
    const storedTheme = window.localStorage.getItem(STORAGE_KEYS.theme);
    const preferredDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextTheme = storedTheme === "dark" || (!storedTheme && preferredDark) ? "dark" : "light";
    const storedDraft = window.localStorage.getItem(STORAGE_KEYS.draft) ?? "";
    const storedRendered = window.localStorage.getItem(STORAGE_KEYS.rendered) ?? "";
    const storedMarkerDocuments = readStoredJson<MarkerDocuments>(STORAGE_KEYS.markerDocuments, {});
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
    setMarkerDocuments(storedMarkerDocuments);
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
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.markerDocuments, JSON.stringify(markerDocuments));
  }, [isHydrated, markerDocuments]);

  useEffect(() => {
    const root = previewRef.current;

    if (!root) {
      return;
    }

    assignRevealVariants(root);
  }, [renderedSource]);

  useEffect(() => {
    const root = previewRef.current;

    if (!root) {
      return;
    }

    applyMarkers(root, markers);
  }, [markers, renderedSource]);

  useEffect(() => {
    const root = previewRef.current;

    if (!root) {
      return;
    }

    const targets = Array.from(root.children) as HTMLElement[];

    if (targets.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.revealed = "true";
            observer.unobserve(entry.target);
          }
        });
      },
      {
        root: isFullscreen ? previewShellRef.current : null,
        rootMargin: "0px 0px -8% 0px",
        threshold: 0.16
      }
    );

    targets.forEach((target) => observer.observe(target));

    return () => {
      observer.disconnect();
    };
  }, [isFullscreen, renderedSource]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === previewShellRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      const root = previewRef.current;

      if (!root) {
        setToolbar(null);
        return;
      }

      const selection = window.getSelection();

      if (!selection) {
        setToolbar(null);
        return;
      }

      const offsets = getSelectionOffsets(root, selection);

      if (!offsets) {
        setToolbar(null);
        return;
      }

      const hasOverlap = markers.some(
        (marker) => marker.start < offsets.end && marker.end > offsets.start
      );

      setToolbar({
        start: offsets.start,
        end: offsets.end,
        top: Math.max(offsets.rect.top + window.scrollY - 58, 16),
        left: Math.max(
          24,
          Math.min(offsets.rect.left + window.scrollX + offsets.rect.width / 2, window.innerWidth - 24)
        ),
        hasOverlap
      });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    window.addEventListener("resize", handleSelectionChange);
    window.addEventListener("scroll", handleSelectionChange, true);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      window.removeEventListener("resize", handleSelectionChange);
      window.removeEventListener("scroll", handleSelectionChange, true);
    };
  }, [markers]);

  const handleThemeToggle = () => {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  };

  const handleRender = () => {
    if (!draftSource.trim()) {
      setStatusMessage("入力欄が空です。サンプル読み込みも利用できます。");
      return;
    }

    setRenderedSource(draftSource);
    setStatusMessage("プレビューを更新しました。本文を選択するとマーカーを付けられます。");
  };

  const handleLoadSample = () => {
    setDraftSource(SAMPLE_MARKDOWN);
    setRenderedSource(SAMPLE_MARKDOWN);
    setStatusMessage("サンプルMarkdownを読み込みました。");
  };

  const clearSelection = () => {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    setToolbar(null);
  };

  const handleClear = () => {
    setDraftSource("");
    setRenderedSource("");
    setToolbar(null);
    setStatusMessage("入力内容をクリアしました。");
    clearSelection();
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

  const handleAddMarker = (color: MarkerColor) => {
    if (!toolbar) {
      return;
    }

    const nextMarker: Marker = {
      id: `${toolbar.start}-${toolbar.end}-${color}-${Date.now()}`,
      start: toolbar.start,
      end: toolbar.end,
      color
    };

    setMarkerDocuments((current) => ({
      ...current,
      [documentId]: mergeWithoutOverlaps(current[documentId] ?? [], nextMarker)
    }));
    setStatusMessage(`${MARKER_COLORS.find((item) => item.value === color)?.label}色のマーカーを追加しました。`);
    clearSelection();
  };

  const handleRemoveMarker = () => {
    if (!toolbar) {
      return;
    }

    setMarkerDocuments((current) => ({
      ...current,
      [documentId]: (current[documentId] ?? []).filter(
        (marker) => marker.end <= toolbar.start || marker.start >= toolbar.end
      )
    }));
    setStatusMessage("選択範囲に重なっていたマーカーを削除しました。");
    clearSelection();
  };

  const handleClearAllMarkers = () => {
    setMarkerDocuments((current) => ({
      ...current,
      [documentId]: []
    }));
    setStatusMessage("この文書のマーカーをすべて削除しました。");
    clearSelection();
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

  return (
    <main className="relative overflow-hidden px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="glass-panel relative overflow-hidden rounded-[2rem] px-6 py-6 sm:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.55),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(163,191,219,0.22),transparent_28%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center rounded-full border border-[var(--line)] bg-white/45 px-3 py-1 text-xs font-medium tracking-[0.18em] text-[var(--text-faint)] uppercase dark:bg-white/5">
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
                読み込み・整形・マーカー保存をブラウザ内で完結
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
              "選択範囲にマーカーを付けて保存"
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
                  本文を選択するとマーカーツールが表示されます。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--text-faint)]">
                  {hasDocument ? `${markers.length} markers` : "no document"}
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
                <button
                  type="button"
                  onClick={handleClearAllMarkers}
                  disabled={!hasDocument || markers.length === 0}
                  className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--text)] transition hover:bg-white/55 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10"
                >
                  すべてのマーカーを消す
                </button>
              </div>
            </div>

            <div
              className={`reading-surface relative min-h-[680px] rounded-[1.7rem] border border-white/40 p-5 shadow-halo transition-all duration-500 sm:p-8 lg:p-12 ${
                isFullscreen ? "min-h-[calc(100vh-8rem)] rounded-[1.2rem] lg:px-20 lg:py-16" : ""
              }`}
            >
              {hasDocument ? (
                <article
                  ref={previewRef}
                  className="prose-magazine mx-auto max-w-3xl"
                  aria-label="Markdownプレビュー"
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    rehypePlugins={[rehypeSanitize]}
                    skipHtml
                    components={{
                      h1: ({ children }) => (
                        <h1 className="animate-drift">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => <h2>{children}</h2>,
                      h3: ({ children }) => <h3>{children}</h3>,
                      p: ({ children }) => <p>{children}</p>,
                      a: ({ children, href }) => (
                        <a href={href} target="_blank" rel="noreferrer">
                          {children}
                        </a>
                      ),
                      table: ({ children }) => (
                        <div className="overflow-x-auto">
                          <table>{children}</table>
                        </div>
                      )
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
                    上品に整えた誌面として表示します。気になった一文には、マーカーも残せます。
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

        {toolbar && (
          <div
            className="toolbar-shadow fixed z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-ink-900/92 px-3 py-2 text-white backdrop-blur-xl"
            style={{ top: toolbar.top, left: toolbar.left }}
            role="toolbar"
            aria-label="マーカーツール"
          >
            {MARKER_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => handleAddMarker(color.value)}
                className="flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition hover:bg-white/10"
              >
                <span className={`h-3 w-3 rounded-full ${color.swatch}`} />
                {color.label}
              </button>
            ))}
            <div className="mx-1 h-5 w-px bg-white/15" />
            <button
              type="button"
              onClick={handleRemoveMarker}
              disabled={!toolbar.hasOverlap}
              className="rounded-full px-3 py-2 text-xs font-medium text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
            >
              削除
            </button>
          </div>
        )}

        <footer className="px-1 pb-4 pt-2">
          <div className="glass-panel flex flex-col gap-2 rounded-[1.8rem] px-6 py-5 text-sm text-[var(--text-soft)] sm:flex-row sm:items-center sm:justify-between">
            <p>余白読本は、ブラウザ内だけで文章を美しく整形するMarkdown読書スタジオです。</p>
            <p>md.2bee.jp 向けMVP / XSS対策あり / localStorage保存対応</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
