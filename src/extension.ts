import * as vscode from "vscode";
import { DictionaryStore } from "./dictionary-store";
import { buildHoverMarkdown } from "./markdown";
import { SegmentTranslation } from "./types";
import { cleanWord, tokenizeForTranslation } from "./word-parser";
import { targetLanguageFor, TranslationService } from "./translation-service";

function isTokenCharacter(value: string): boolean {
  return /[\p{L}\p{N}_$-]/u.test(value);
}

function wordRangeAtPosition(document: vscode.TextDocument, position: vscode.Position): vscode.Range | undefined {
  const line = document.lineAt(position.line).text;
  if (position.character > line.length) {
    return undefined;
  }

  let start = position.character;
  let end = position.character;
  while (start > 0 && isTokenCharacter(line[start - 1])) {
    start -= 1;
  }
  while (end < line.length && isTokenCharacter(line[end])) {
    end += 1;
  }

  if (start === end) {
    return undefined;
  }
  return new vscode.Range(position.line, start, position.line, end);
}

function selectedTextFor(document: vscode.TextDocument, hoveredText: string): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.toString() !== document.uri.toString() || editor.selection.isEmpty) {
    return hoveredText;
  }

  const selected = cleanWord(document.getText(editor.selection));
  return selected && selected.includes(hoveredText) ? selected : hoveredText;
}

interface HoverResolution {
  key: string;
  document: vscode.TextDocument;
  documentVersion: number;
  editor?: vscode.TextEditor;
  range: vscode.Range;
  originText: string;
  phase: "local" | "remote" | "complete";
  localResults?: SegmentTranslation[];
  targetLanguage?: "en" | "zh-CN";
}

function resolutionKey(
  document: vscode.TextDocument,
  range: vscode.Range,
  originText: string,
): string {
  return [
    document.uri.toString(),
    document.version,
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
    originText,
  ].join("\u0000");
}

export function activate(context: vscode.ExtensionContext): void {
  const dictionary = new DictionaryStore(context.extensionUri);
  const translation = new TranslationService(dictionary);
  const hoverDecoration = vscode.window.createTextEditorDecorationType({});
  let activeResolution: HoverResolution | undefined;

  context.subscriptions.push(hoverDecoration);

  function markdownFor(originText: string, results: SegmentTranslation[]): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString(buildHoverMarkdown(originText, results));
    markdown.isTrusted = false;
    markdown.supportHtml = false;
    markdown.supportThemeIcons = true;
    return markdown;
  }

  function loadingResults(segments: string[]): SegmentTranslation[] {
    return segments.map((term) => ({
      term,
      translation: "",
      source: "none",
      status: "loading",
    } satisfies SegmentTranslation));
  }

  function isCurrentResolution(
    resolution: HoverResolution,
  ): resolution is HoverResolution & { editor: vscode.TextEditor } {
    return activeResolution === resolution
      && resolution.editor !== undefined
      && vscode.window.activeTextEditor === resolution.editor
      && resolution.editor.document.uri.toString() === resolution.document.uri.toString()
      && resolution.document.version === resolution.documentVersion;
  }

  function setHoverDecoration(resolution: HoverResolution, markdown: vscode.MarkdownString): void {
    if (!isCurrentResolution(resolution)) {
      return;
    }
    resolution.editor.setDecorations(hoverDecoration, [{
      range: resolution.range,
      hoverMessage: markdown,
    }]);
  }

  function refreshHoverIfCursorIsInside(resolution: HoverResolution): void {
    if (!isCurrentResolution(resolution) || !resolution.range.contains(resolution.editor.selection.active)) {
      return;
    }
    void vscode.commands.executeCommand("editor.action.showHover", { focus: "noAutoFocus" });
  }

  const provider: vscode.HoverProvider = {
    provideHover: (document, position) => {
      if (!vscode.workspace.getConfiguration("codeTranslate").get<boolean>("enable", true)) {
        return undefined;
      }

      const range = wordRangeAtPosition(document, position) ?? document.getWordRangeAtPosition(position);
      if (!range) {
        return undefined;
      }

      const hoveredText = cleanWord(document.getText(range));
      const originText = selectedTextFor(document, hoveredText);
      const segments = tokenizeForTranslation(originText);
      if (segments.length === 0) {
        return undefined;
      }

      const key = resolutionKey(document, range, originText);
      const editor = vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()
        ? vscode.window.activeTextEditor
        : undefined;
      const existing = activeResolution?.key === key ? activeResolution : undefined;

      if (existing) {
        const results = existing.localResults
          ? existing.targetLanguage
            ? translation.mergeRemoteResults(existing.localResults, existing.targetLanguage)
            : existing.localResults
          : loadingResults(segments);
        const markdown = markdownFor(originText, results);
        if (editor) {
          editor.setDecorations(hoverDecoration, [{ range, hoverMessage: markdown }]);
        }
        return new vscode.Hover(markdown, range);
      }

      const resolution: HoverResolution = {
        key,
        document,
        documentVersion: document.version,
        editor,
        range,
        originText,
        phase: "local",
      };
      activeResolution = resolution;

      const initialMarkdown = markdownFor(originText, loadingResults(segments));
      if (editor) {
        editor.setDecorations(hoverDecoration, [{ range, hoverMessage: initialMarkdown }]);
      }

      void (async () => {
        const localResults = await translation.translateLocalSegments(segments);
        if (!isCurrentResolution(resolution) || localResults.length === 0) {
          return;
        }

        resolution.localResults = localResults;
        const missing = localResults
          .filter((result) => result.source === "none")
          .map((result) => result.term);
        if (missing.length === 0 || !translation.isRemoteFallbackEnabled()) {
          resolution.phase = "complete";
          const markdown = markdownFor(originText, localResults);
          setHoverDecoration(resolution, markdown);
          refreshHoverIfCursorIsInside(resolution);
          return;
        }

        const targetLanguage = targetLanguageFor(missing);
        resolution.targetLanguage = targetLanguage;
        const statesBeforeRequest = missing.map((segment) => translation.getRemoteState(segment, targetLanguage));
        const shouldWaitForRemote = statesBeforeRequest.some(
          (state) => state.status === "unrequested" || state.status === "loading",
        );
        const remoteRequest = translation.ensureRemote(missing, targetLanguage);
        resolution.phase = shouldWaitForRemote ? "remote" : "complete";

        const pendingMarkdown = markdownFor(
          originText,
          translation.mergeRemoteResults(localResults, targetLanguage),
        );
        setHoverDecoration(resolution, pendingMarkdown);
        if (!shouldWaitForRemote) {
          refreshHoverIfCursorIsInside(resolution);
          return;
        }

        await remoteRequest;
        if (!isCurrentResolution(resolution)) {
          return;
        }

        resolution.phase = "complete";
        const finalMarkdown = markdownFor(
          originText,
          translation.mergeRemoteResults(localResults, targetLanguage),
        );
        setHoverDecoration(resolution, finalMarkdown);
        refreshHoverIfCursorIsInside(resolution);
      })();

      return new vscode.Hover(initialMarkdown, range);
    },
  };

  context.subscriptions.push(vscode.languages.registerHoverProvider("*", provider));
}

export function deactivate(): void {
  // VS Code disposes the registered provider through the extension context.
}
