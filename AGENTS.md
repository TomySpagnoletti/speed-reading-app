# Agent guidelines

## Language

- Everything in this repository is written in English: code, identifiers, UI text, error messages, logs, documentation, commit messages.
- No French anywhere, including user-facing strings.

## Comments

- Do not write comments in code. None: no line comments, no block comments, no doc comments, no commented-out code.
- This applies to every file type: TypeScript, Rust, CSS, HTML, JSON, TOML, config files, ignore files.
- If you find a comment, delete it. Code must explain itself through naming and structure.

## Line length

- Do not wrap or limit lines to 80 columns. Let lines be as long as they naturally are.

## Single source of truth

- Every piece of data, configuration and logic exists in exactly one place.
- No fallback mechanisms: no "try A, else B, else C" chains, no default values masking missing data, no alternative code paths doing the same thing.
- Only one way to do each thing. If two mechanisms achieve the same result, keep one and delete the other.
- No defensive or reassurance code: no redundant checks, no silent recovery, no guards for states that cannot happen. Fail loudly with a clear error instead.
- No code duplication. Factor shared logic into one canonical place.
