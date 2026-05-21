$lines = Get-Content 'docs\study.md' -Encoding UTF8

# Fix garbled Conflict 6/7 headings
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match 'Conflict 6.*resolved by the glyph' -and $lines[$i] -match '\*Conflict') {
        $lines[$i] = '*Conflict 6 — resolved by the glyph lookup architecture*'
    }
    if ($lines[$i] -match 'Conflict 7.*resolved by the glyph' -and $lines[$i] -match '\*Conflict') {
        $lines[$i] = '*Conflict 7 — resolved by the glyph lookup architecture*'
    }
    if ($lines[$i] -match '\| Conflict 6 \| Resolved by glyph') {
        $lines[$i] = '| Conflict 6 | Resolved by glyph lookup architecture — no grammar restriction needed |'
    }
    if ($lines[$i] -match '\| Conflict 7 \| Resolved by glyph') {
        $lines[$i] = '| Conflict 7 | Resolved by glyph lookup architecture — no script-specific rules needed |'
    }
}

# Fix broken Gap 7 sentence (two lines that got merged)
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match 'It is a backslash identifier\.$') {
        if ($i+1 -lt $lines.Length -and $lines[$i+1] -match '^multi-letter identifier') {
            $lines[$i] = 'It is a backslash identifier with raw name `mapsto` that maps to the ↦ glyph in the renderer.'
            $lines[$i+1] = ''
        }
    }
}

# Find Summary table line and insert Conflict 8 before it
$summaryLine = -1
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '^\*Summary of actions required') { $summaryLine = $i; break }
}

if ($summaryLine -ge 0) {
    $conflict8 = @(
        '*Conflict 8 — `!=` (not-equal) vs `!` (factorial)*',
        '',
        '`!=` starts with `!`. `FactorialSuffix` in `Postfix` matches `!` as a',
        'postfix operator. So `x!=y` would be parsed as: `Postfix` consumes `x!`',
        'as `FactorialExpression(x)`, then `Relational` sees `=y` and produces',
        '`BinaryExpression(=, FactorialExpression(x), y)` — i.e. `(x!) = y`.',
        'But the intended parse is `BinaryExpression(!=, x, y)`.',
        '',
        'Resolution: `FactorialSuffix` regex must use a negative lookahead to',
        'avoid consuming `!` when immediately followed by `=`:',
        '```',
        'FactorialSuffix: /^!(?!=)/',
        '```',
        'This matches `!` only when NOT followed by `=`. So `x!` matches factorial,',
        'but `x!=y` leaves `!=` intact for the `Relational` level.',
        ''
    )
    $lines = $lines[0..($summaryLine-1)] + $conflict8 + $lines[$summaryLine..($lines.Length-1)]
}

# Add Conflict 8 to summary table — find the table and insert row
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '^\| Conflict 6 \| Resolved by glyph') {
        $lines = $lines[0..($i-1)] + @('| Conflict 8 | Change `FactorialSuffix` regex to `/^!(?!=)/` (negative lookahead) |') + $lines[$i..($lines.Length-1)]
        break
    }
}

# Update FactorialSuffix concrete task to include the negative lookahead
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match 'Add `FactorialSuffix` to `Postfix`.*literal `!`') {
        $lines[$i] = '- [ ] Add `FactorialSuffix` to `Postfix` suffix choices: regex `/^!(?!=)/`'
        $lines[$i+1] = '      (negative lookahead — does not match `!=`) → `FactorialExpression(base)` (Gap 3 + Conflict 8 fix)'
    }
}

[System.IO.File]::WriteAllLines('docs\study.md', $lines, [System.Text.UTF8Encoding]::new($false))
