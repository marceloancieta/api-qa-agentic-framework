// Minimal POSIX-style word splitting (the subset of `shlex.split` the hooks need).
//
// Handles single quotes, double quotes with backslash escapes, backslash outside quotes, and `$(...)`
// command substitution kept as ONE word inside double quotes (so a heredoc commit message survives).
// Returns null on unbalanced quoting: callers must treat that as "could not check", never as clean.

export function splitWords(command) {
  const words = [];
  let current = '';
  let inWord = false;
  let i = 0;
  const n = command.length;

  while (i < n) {
    const c = command[i];
    if (c === "'") {
      const end = command.indexOf("'", i + 1);
      if (end === -1) return null;
      current += command.slice(i + 1, end);
      inWord = true;
      i = end + 1;
    } else if (c === '"') {
      i += 1;
      let depth = 0;
      let closed = false;
      while (i < n) {
        const d = command[i];
        if (d === '\\' && i + 1 < n && depth === 0 && '"\\$`'.includes(command[i + 1])) {
          current += command[i + 1];
          i += 2;
          continue;
        }
        if (d === '$' && command[i + 1] === '(') depth += 1;
        else if (d === ')' && depth > 0) depth -= 1;
        else if (d === '"' && depth === 0) {
          closed = true;
          i += 1;
          break;
        }
        current += d;
        i += 1;
      }
      if (!closed) return null;
      inWord = true;
    } else if (c === '\\' && i + 1 < n) {
      current += command[i + 1];
      inWord = true;
      i += 2;
    } else if (/\s/.test(c)) {
      if (inWord) words.push(current);
      current = '';
      inWord = false;
      i += 1;
    } else {
      current += c;
      inWord = true;
      i += 1;
    }
  }
  if (inWord) words.push(current);
  return words;
}

/** `$(cat <<'EOF' ... EOF)` -> the heredoc body; anything else is returned unchanged. */
export function unwrapHeredoc(value) {
  const match = /^\$\(\s*cat\s+<<-?\s*['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\s*\1\s*\)\s*$/.exec(value);
  return match ? match[2] : value;
}
