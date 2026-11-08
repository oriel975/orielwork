#!/usr/bin/env bash
# Claude Code status line: context-window bar + usage limits + model/cost.
# Reads the session JSON from stdin.
input=$(cat)
j() { echo "$input" | jq -r "$1" 2>/dev/null; }

model=$(j '.model.display_name // "Claude"')
dir=$(j '.workspace.current_dir // .cwd // ""'); dir=${dir##*/}
cost=$(j '.cost.total_cost_usd // empty')

# Context used %: prefer the official field, fall back to transcript tokens.
pct=$(j '.context_window.used_percentage // empty')
if [ -z "$pct" ]; then
  tp=$(j '.transcript_path // empty')
  size=$(j '.context_window.context_window_size // 200000')
  if [ -n "$tp" ] && [ -f "$tp" ]; then
    used=$(tac "$tp" | jq -r 'select(.message.usage != null) | .message.usage | (.input_tokens//0)+(.cache_read_input_tokens//0)+(.cache_creation_input_tokens//0)' 2>/dev/null | head -1)
    [ -n "$used" ] && pct=$(( used * 100 / size ))
  fi
fi
pct=${pct%.*}; pct=${pct:-0}
[ "$pct" -gt 100 ] && pct=100

color() { # green <60, yellow <85, red otherwise
  if [ "$1" -lt 60 ]; then printf '\033[32m'; elif [ "$1" -lt 85 ]; then printf '\033[33m'; else printf '\033[31m'; fi
}
bar() { # $1=percent, $2=width
  local p=$1 w=$2 f i s=""
  f=$(( p * w / 100 ))
  for ((i=0;i<w;i++)); do [ $i -lt $f ] && s+="█" || s+="░"; done
  printf '%s%s\033[0m' "$(color "$p")" "$s"
}

out="\033[1m${model}\033[0m"
[ -n "$dir" ] && out+=" \033[2m${dir}\033[0m"
out+=" │ ctx $(bar "$pct" 12) ${pct}% (נשאר $((100-pct))%)"

for k in five_hour seven_day; do
  r=$(j ".rate_limits.${k}.used_percentage // empty"); r=${r%.*}
  if [ -n "$r" ]; then
    lbl=$([ $k = five_hour ] && echo 5h || echo 7d)
    out+=" │ ${lbl} $(bar "$r" 6) ${r}%"
  fi
done
[ -n "$cost" ] && out+=" │ \$$(printf '%.2f' "$cost")"
printf '%b\n' "$out"
