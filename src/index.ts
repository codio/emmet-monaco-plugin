import expandAction, {hasAbbreviation} from './action/expand-abbreviation';
import { balanceActionInward, balanceActionOutward } from './action/balance';
import commentAction from './action/comment';
import evaluateMathAction from './action/evaluate-math';
import goToEditPointAction from './action/go-to-edit-point';
import goToTagPairAction from './action/go-to-tag-pair';
import incrementNumberAction from './action/inc-dec-number';
import removeTagAction from './action/remove-tag';
import selectItemAction from './action/select-item';
import splitJoinTagAction from './action/split-join-tag';
import wrapWithAbbreviationAction from './action/wrap-with-abbreviation';
import mergeLines from './action/merge-lines';
import reflectCssValue from './action/reflect-css-value';
import {getEmmetConfig, setEmmetConfig} from './lib/config';

const actions = {
    expandAction,
    balanceActionInward,
    balanceActionOutward,
    commentAction,
    evaluateMathAction,
    goToEditPointAction,
    goToTagPairAction,
    incrementNumberAction,
    removeTagAction,
    selectItemAction,
    splitJoinTagAction,
    wrapWithAbbreviationAction,
    mergeLines,
    reflectCssValue
}

const config = {
    getEmmetConfig,
    setEmmetConfig
}

const helper = {
    hasAbbreviation
}

export {
    actions,
    config,
    helper
}
