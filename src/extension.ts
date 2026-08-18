import * as vscode from "vscode";
import { DictionaryStore } from "./dictionary-store";
import {
  genMarkdown,
  markdownFooter,
  markdownHeader,
  markdownLine,
} from "./markdown";
import { query } from "./query";
import { cleanWord, getWordArray } from "./word-parser";

export function activate(context: vscode.ExtensionContext): void {
  const dictionary = new DictionaryStore(context.extensionUri);

  const provider: vscode.HoverProvider = {
    async provideHover(document, position) {
      if (!vscode.workspace.getConfiguration("codeTranslate").get<boolean>("enable", true)) {
        return undefined;
      }

      const wordRange = document.getWordRangeAtPosition(position);
      if (!wordRange) {
        return undefined;
      }

      let word = document.getText(wordRange);
      const activeEditor = vscode.window.activeTextEditor;
      const selectText = activeEditor?.document.getText(activeEditor.selection) ?? "";
      if (selectText && word.indexOf(selectText) > -1) {
        word = selectText;
      }

      const originText = cleanWord(word);
      const words = getWordArray(cleanWord(word)) ?? [];
      let hoverText = "";

      for (let i = 0; i < words.length; i += 1) {
        const currentWord = words[i];
        const result = await query(currentWord, dictionary);
        if (i === 0) {
          hoverText += genMarkdown(currentWord, result.translation, result.phonetic);
        } else {
          hoverText += markdownLine + genMarkdown(currentWord, result.translation, result.phonetic);
        }
      }

      const header = markdownHeader.replace("$word", originText);
      hoverText = header + hoverText + markdownFooter;
      return new vscode.Hover(hoverText);
    },
  };

  context.subscriptions.push(vscode.languages.registerHoverProvider("*", provider));
}

export function deactivate(): void {
  // VS Code disposes the registered provider through the extension context.
}
