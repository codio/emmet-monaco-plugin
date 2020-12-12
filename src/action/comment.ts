import Scanner from '@emmetio/scanner';
import { scan, createOptions, ElementType, ScannerOptions } from '@emmetio/html-matcher';
import matchCSS from '@emmetio/css-matcher';
import { TextRange } from '@emmetio/action-utils';
import { isSpace, getContent, narrowToNonSpace, toTextRange, substr, toRange, textRangeEmpty, getLineRange } from '../lib/utils';
import { isHTML, isXML, isCSS, syntaxInfo } from '../lib/syntax';
import { Editor } from '../lib/types';

interface Block {
    range: TextRange;
    commentStart?: string;
    commentEnd?: string;
}

interface Tag {
    name: string;
    start: number;
    end: number;
}

type CommentTokens = [string, string];

const htmlComment: CommentTokens = ['<!--', '-->'];
const cssComment: CommentTokens = ['/*', '*/'];

export default function comment(editor: Editor): void {
    const model = editor.getModel();
    let selections = editor.getSelections();
    if (model && selections) {
        selections = selections.slice().reverse();
        for (const sel of selections) {
            const selRange = toTextRange(editor, sel);
            const { syntax } = syntaxInfo(editor, selRange[0]);
            const tokens = syntax && isCSS(syntax) ? cssComment : htmlComment;
            const block = getRangeForComment(editor, selRange[0]);

            if (block && block.commentStart) {
                // Caret inside comment, strip it
                removeComment(editor, block);
            } else if (block && textRangeEmpty(selRange)) {
                // Wrap block with comments but remove inner comments first
                let removed = 0;
                for (const c of getCommentRegions(editor, block.range, tokens).reverse()) {
                    removed += removeComment(editor, c);
                }

                addComment(editor, [block.range[0], block.range[1] - removed], tokens);
            } else if (!textRangeEmpty(selRange)) {
                // No matching block, comment selection
                addComment(editor, selRange, tokens);
            } else {
                // No matching block, comment line
                const lineRange = getLineRange(editor, selRange[0]);
                addComment(editor, narrowToNonSpace(editor, lineRange), tokens);
            }
        }
    }
}

/**
 * Removes comment markers from given region. Returns amount of characters removed
 */
function removeComment(editor: Editor, { range, commentStart, commentEnd }: Block): number {
    const text = substr(editor, range);

    if (commentStart && text.startsWith(commentStart)) {
        let startOffset = commentStart.length;
        let endOffset = commentEnd && text.endsWith(commentEnd)
            ? commentEnd.length
            : 0;

        // Narrow down offsets for whitespace
        if (isSpace(text[startOffset])) {
            startOffset += 1;
        }

        if (endOffset && isSpace(text[text.length - endOffset - 1])) {
            endOffset += 1;
        }

        editor.executeEdits('emmetRemoveComment', [{
            range: toRange(editor, [range[1] - endOffset, range[1]]),
            text: ''
        }, {
            range: toRange(editor, [range[0], range[0] + startOffset]),
            text: ''
        }]);
        editor.pushUndoStop();

        return startOffset + endOffset;
    }

    return 0;
}

/**
 * Adds comments around given range
 */
function addComment(editor: Editor, range: TextRange, tokens: CommentTokens): void {
    const [from, to] = range;
    editor.executeEdits('emmetAddComment', [{
        range: toRange(editor, [to, to]),
        text: ' ' + tokens[1]
    }, {
        range: toRange(editor, [from, from]),
        text: tokens[0] + ' '
    }]);
    editor.pushUndoStop();
}

/**
 * Finds comments inside given region and returns their regions
 */
function getCommentRegions(editor: Editor, range: TextRange, tokens: CommentTokens): Block[] {
    const result: Block[] = [];
    const text = substr(editor, range);
    const start = range[0];
    let offset = 0

    while (true) {
        const commentStart = text.indexOf(tokens[0], offset);
        if (commentStart !== -1) {
            offset = commentStart + tokens[0].length;

            // Find comment end
            const commentEnd = text.indexOf(tokens[1], offset);
            if (commentEnd !== -1) {
                offset = commentEnd + tokens[1].length;
                result.push({
                    range: [start + commentStart, start + offset],
                    commentStart: tokens[0],
                    commentEnd: tokens[1],
                });
            }
        } else {
            break;
        }
    }

    return result;
}

function getRangeForComment(editor: Editor, pos: number): Block | undefined {
    const info = syntaxInfo(editor, pos);
    const { syntax, context } = info;

    if (!syntax) {
        return;
    }

    if (isHTML(syntax)) {
        return getHTMLBlockRange(getContent(editor), pos, isXML(syntax));
    }

    if (isCSS(syntax)) {
        let offset = 0;
        let content = '';
        if (context?.type === 'css' && context.embedded) {
            // It’s an embedded CSS, use embedded content instead of full document
            // content
            content = substr(editor, context.embedded);
            offset = context.embedded[0];
        } else {
            content = getContent(editor);
        }

        const comment = findCSSComment(content, pos - offset);
        if (comment) {
            comment.range[0] += offset;
            comment.range[1] += offset;
            return comment;
        }

        const css = matchCSS(content, pos - offset);

        if (css) {
            return {
                range: [css.start + offset, css.end + offset]
            };
        }
    }
}

/**
 * Returns range for comment toggling
 */
function getHTMLBlockRange(source: string, pos: number, xml = false): Block | undefined {
    // Since we expect large input document, we’ll use pooling technique
    // for storing tag data to reduce memory pressure and improve performance
    const pool: Tag[] = [];
    const stack: Tag[] = [];
    const options = createOptions({ xml, allTokens: true });
    let result: Block | undefined;

    scan(source, (name, type, start, end) => {
        if (type === ElementType.Open && isSelfClose(name, options)) {
            // Found empty element in HTML mode, mark is as self-closing
            type = ElementType.SelfClose;
        }

        if (type === ElementType.Open) {
            // Allocate tag object from pool
            stack.push(allocTag(pool, name, start, end));
        } else if (type === ElementType.SelfClose) {
            if (start < pos && pos < end) {
                // Matched given self-closing tag
                result = { range: [start, end] };
                return false;
            }
        } else if (type === ElementType.Close) {
            const tag = last(stack);
            if (tag && tag.name === name) {
                // Matching closing tag found
                if (tag.start < pos && pos < end) {
                    result = {
                        range: [tag.start, end],
                    };
                    return false;
                } else if (stack.length) {
                    // Release tag object for further re-use
                    releaseTag(pool, stack.pop()!);
                }
            }
        } else if (start < pos && pos < end) {
            // Found other token that matches given location
            result = { range: [start, end] };
            if (type === ElementType.Comment) {
                result.commentStart = htmlComment[0];
                result.commentEnd = htmlComment[1];
            }
            return false;
        }
    }, options);

    stack.length = pool.length = 0;
    return result;
}

/**
 * If given `pos` location is inside CSS comment in given `code`, returns its
 * range
 */
function findCSSComment(code: string, pos: number): Block | undefined {
    const enum Chars {
        Asterisk = 42,
        Slash = 47,
        Backslash = 92,
        LF = 10,
        CR = 13,
    }
    const scanner = new Scanner(code);

    while (!scanner.eof() && pos > scanner.pos) {
        const start = scanner.pos;

        if (consumeSeq2(scanner, Chars.Slash, Chars.Asterisk)) {
            // Consumed multiline comment start
            while (!scanner.eof() && !consumeSeq2(scanner, Chars.Asterisk, Chars.Slash)) {
                scanner.pos++;
            }

            if (start < pos && pos < scanner.pos) {
                return {
                    range: [start, scanner.pos],
                    commentStart: cssComment[0],
                    commentEnd: cssComment[1],
                };
            }
        } else if (consumeSeq2(scanner, Chars.Slash, Chars.Slash)) {
            // Consumed single-line comment
            while (!scanner.eof() && !scanner.eat(Chars.CR) && !scanner.eat(Chars.LF)) {
                scanner.pos++;
            }
            if (start < pos && pos < scanner.pos) {
                return {
                    range: [start, scanner.pos],
                    commentStart: '//',
                };
            }
        } else {
            scanner.pos++;
        }
    }
}

/**
 * Returns `true` if both `ch1` and `ch2` where consumed
 */
function consumeSeq2(scanner: Scanner, ch1: number, ch2: number): boolean {
    const { pos } = scanner;
    if (scanner.eat(ch1) && scanner.eat(ch2)) {
        return true;
    }

    scanner.pos = pos;
    return false;
}

/**
 * Check if given tag is self-close for current parsing context
 */
function isSelfClose(name: string, options: ScannerOptions) {
    return !options.xml && options.empty.includes(name);
}

function allocTag(pool: Tag[], name: string, start: number, end: number): Tag {
    if (pool.length) {
        const tag = pool.pop()!;
        tag.name = name;
        tag.start = start;
        tag.end = end;
        return tag;
    }
    return { name, start, end };
}

function releaseTag(pool: Tag[], tag: Tag) {
    pool.push(tag);
}

function last<T>(arr: T[]): T | null {
    return arr.length ? arr[arr.length - 1] : null;
}
