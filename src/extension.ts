import * as vscode from "vscode";
import { DictionaryStore } from "./dictionary-store";
import { buildHoverMarkdown } from "./markdown";
import { query, querySentence } from "./query";
import { cleanWord, tokenizeForTranslation } from "./word-parser";

export function activate(context: vscode.ExtensionContext): void {
  const dictionary = new DictionaryStore(context.extensionUri);

  const provider: vscode.HoverProvider = {
    async provideHover(document, position) {
      if (!vscode.workspace.getConfiguration("codeTranslate").get<boolean>("enable", true)) {
        return undefined;
      }

      const activeEditor = vscode.window.activeTextEditor;
      const selectText = activeEditor
        && activeEditor.document.uri.toString() === document.uri.toString()
        && !activeEditor.selection.isEmpty
        ? cleanWord(document.getText(activeEditor.selection)).trim()
        : "";
      const wordRange = document.getWordRangeAtPosition(position);
      if (!wordRange && !selectText) {
        return undefined;
      }

      let word = wordRange ? document.getText(wordRange) : selectText;
      if (selectText && (!wordRange || selectText.includes(word))) {
        word = selectText;
      }

      const originText = cleanWord(word).trim();
      const words = tokenizeForTranslation(originText);
      const sentenceTranslation = selectText ? await querySentence(originText) : "";
      const results = [];

      for (let i = 0; i < words.length; i += 1) {
        const currentWord = words[i];
        results.push(await query(currentWord, dictionary));
      }

      return new vscode.Hover(buildHoverMarkdown(originText, results, sentenceTranslation));
    },
  };

  context.subscriptions.push(vscode.languages.registerHoverProvider("*", provider));
}

export function deactivate(): void {
  // VS Code disposes the registered provider through the extension context.
}
