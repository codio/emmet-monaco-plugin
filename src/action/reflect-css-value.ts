import {EditOperation, Editor} from '../lib/types';
import {getCaret, getContent, substr, toRange} from '../lib/utils';
import {docSyntax, isCSS} from '../lib/syntax';
import {CSSProperty, CSSSection, getCSSSection} from '@emmetio/action-utils';

const vendorPrefixes = ['-webkit-', '-moz-', '-ms-', '-o-', ''];

export default function reflectCssValue(editor: Editor): void {
    const syntax = docSyntax(editor);
    const model = editor.getModel();

    if (!model || !isCSS(syntax)) {
        return;
    }
    const caret = getCaret(editor);
    const section = getCSSSection(getContent(editor), caret, true);
    if (!section) {
        return;
    }
    const currentProperty = section.properties?.find(prop => caret >= prop.name[0] && caret <= prop.value[1]);
    if (!currentProperty) {
        return;
    }
    const currentPropName = substr(editor, currentProperty.name);
    const currentPropValue = substr(editor, currentProperty.value);
    let currentPrefix = '';
    for (const prefix of vendorPrefixes) {
        if (currentPropName.startsWith(prefix)) {
            currentPrefix = prefix;
            break;
        }
    }
    let edits: EditOperation[] = [];
    const propName = currentPropName.substr(currentPrefix.length);

    vendorPrefixes.forEach(prefix => {
        if (prefix === currentPrefix) {
            return;
        }
        const prop = findPropByName(editor, section, prefix + propName);
        if (prop) {
            edits.push({
                text: currentPropValue,
                range: toRange(editor, prop.value)
            });
        }
    });

    if (edits.length) {
        editor.executeEdits('emmetReflectCssValues', edits, () => null);
        editor.pushUndoStop();
    }
}

const findPropByName = (editor: Editor, section: CSSSection, name: string): CSSProperty | undefined => {
    return section.properties?.find(prop => substr(editor, prop.name) === name);
}

