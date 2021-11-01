import {docSyntax, isXML} from '../lib/syntax';
import { getTagContext } from '../lib/plugin';
import { Editor, EditOperation} from '../lib/types';
import {rangeToSelection, substr, toRange, toTextRange} from '../lib/utils';

export default function mergeLines(editor: Editor): void {
    const syntax = docSyntax(editor);
    const isXmlSyntax = isXML(syntax);
    const selections = editor.getSelections();
    const model = editor.getModel();

    if (!model || !selections) {
        return;
    }

    let edits: EditOperation[] = [];
    selections.forEach(selection => {
        const startPos = model.getOffsetAt(selection.getStartPosition());
        if (selection.isEmpty()) {
            const tag = getTagContext(editor, startPos, isXmlSyntax);
            const textRange = tag && tag.close ? toRange(editor, [tag.open[0], tag.close[1]]) : null;
            if (!textRange) {
                return
            }
            const textSelection = rangeToSelection(textRange)
            selection = selection.setStartPosition(textSelection.selectionStartLineNumber, textSelection.selectionStartColumn)
            selection = selection.setEndPosition(textSelection.positionLineNumber, textSelection.positionColumn)
        }
        const lines = substr(editor, toTextRange(editor, selection)).split(/\r\n|\r|\n/g);

        for (let i = 1; i < lines.length; i++) {
            lines[i] = lines[i].replace(/^\s+/, '');
        }

        const text = lines.join('').replace(/\s{2,}/, ' ');
        edits.push({
            range: selection,
            text
        })
    });

    if (edits.length) {
        editor.executeEdits('emmetMergeLines', edits, []);
        editor.pushUndoStop();
    }
}
