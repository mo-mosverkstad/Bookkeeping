// ── PEG Expression Types (engine-level) ──────────────────────────────────────

export type PEGExpression =
    | LiteralExpression
    | RegexExpression
    | SequenceExpression
    | ChoiceExpression
    | RepeatExpression
    | RuleReferenceExpression;

export interface LiteralExpression { type: "literal"; value: string; }
export interface RegexExpression { type: "regex"; regex: RegExp; name?: string; }
export interface SequenceExpression { type: "sequence"; parts: PEGExpression[]; }
export interface ChoiceExpression { type: "choice"; options: PEGExpression[]; }
export interface RepeatExpression { type: "repeat"; expr: PEGExpression; }
export interface RuleReferenceExpression { type: "rule"; name: string; }

export interface MatchSuccess<T = unknown> { success: true; position: number; node: T; }
export interface MatchFailure { success: false; position: number; }
export type MatchResult<T = unknown> = MatchSuccess<T> | MatchFailure;

export interface ParseErrorInfo {
    position: number;
    expected: Set<string>;
    found: string | null;
}

export interface PEGRule {
    peg: PEGExpression;
    build?: (node: any) => any;
}

export interface PEGParserOptions { skip?: RegExp; }
export type Grammar = Record<string, PEGRule>;
