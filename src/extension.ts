import * as vscode from "vscode";
import { DictionaryStore } from "./dictionary-store";
import { buildHoverMarkdown } from "./markdown";
import { cleanWord, tokenizeForTranslation } from "./word-parser";
import { TranslationService } from "./translation-service";

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

export function activate(context: vscode.ExtensionContext): void {
  const dictionary = new DictionaryStore(context.extensionUri);
  const translation = new TranslationService(dictionary);

  const provider: vscode.HoverProvider = {
    provideHover: async (document, position, cancellationToken) => {
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

      const results = await translation.translateSegments(segments, cancellationToken);
      if (cancellationToken.isCancellationRequested || results.length === 0) {
        return undefined;
      }

      const markdown = new vscode.MarkdownString(buildHoverMarkdown(originText, results));
      markdown.isTrusted = false;
      markdown.supportHtml = false;
      return new vscode.Hover(markdown, range);
    },
  };

  context.subscriptions.push(vscode.languages.registerHoverProvider("*", provider));
}

export function deactivate(): void {
  // VS Code disposes the registered provider through the extension context.
}
