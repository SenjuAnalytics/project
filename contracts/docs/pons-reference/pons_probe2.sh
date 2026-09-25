#!/usr/bin/env bash
cd /c/Users/shole/OneDrive/Desktop/contracts1 || exit 1
J=pons_src.json
OUT=pons_analysis.txt
: > "$OUT"
{
  echo "JSON_BYTES=$(wc -c < "$J")"
  echo ""
  echo "=== SOL FILE PATHS ==="
  grep -oE '[A-Za-z0-9_/]+\.sol' "$J" | sort -u

  echo ""
  echo "=== SETTERS (owner/fee/tax/split/share/treasury/protocol/snipe) ==="
  grep -oE 'function set[A-Za-z0-9_]+\([^)]{0,220}\)[^;{]{0,140}\{' "$J" | grep -iE 'fee|tax|split|share|treasury|protocol|snipe|recipient|owner|bps' | sort -u

  echo ""
  echo "=== FEE/SHARE/TAX/BPS STATE VARS & CONSTANTS ==="
  grep -oE 'uint[0-9]*[[:space:]]+(public|internal|private)?[[:space:]]*(constant|immutable)?[[:space:]]*[A-Za-z0-9_]*(Fee|Tax|Share|Bps|Protocol|Creator|Treasury|Platform)[A-Za-z0-9_]*[[:space:]]*=[[:space:]]*[0-9_]+' "$J" | sort -u | head -100

  echo ""
  echo "=== MAX_ CONSTANTS ==="
  grep -oE 'MAX_[A-Z0-9_]+[[:space:]]*=[[:space:]]*[0-9_]+' "$J" | sort -u

  echo ""
  echo "=== SPLIT / DISTRIBUTE CALLS ==="
  grep -oE '(_accrueFees|_splitFees|_distribute|_sendFees|_payFees|_takeFee|_collectFees)\([^;]{0,180}' "$J" | sort -u | head -40

  echo ""
  echo "=== COMMENTS mentioning split/creator/protocol/treasury/snipe ==="
  grep -oE '//[^\\]{0,150}(split|creator|protocol|treasury|snipe|70%|30%)[^\\]{0,150}' "$J" | sort -u | head -50

  echo ""
  echo "=== END ==="
} >> "$OUT"
