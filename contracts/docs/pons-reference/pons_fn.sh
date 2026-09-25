#!/usr/bin/env bash
cd /c/Users/shole/OneDrive/Desktop/contracts1 || exit 1
J=pons_src.json
T=pons_curve.txt
OUT=pons_fn.txt

# Unescape JSON string content into readable Solidity (perl preferred, sed fallback).
perl -pe 's/\\r//g; s/\\n/\n/g; s/\\t/  /g; s/\\"/"/g' "$J" > "$T" 2>/dev/null || \
  sed 's/\\r//g; s/\\n/\n/g; s/\\t/  /g; s/\\"/"/g' "$J" > "$T"

: > "$OUT"
{
  echo "TXT_LINES=$(wc -l < "$T")"
  echo ""
  echo "===== _accrueFees ====="
  grep -n -A 24 'function _accrueFees' "$T"
  echo ""
  echo "===== SWEEP / SPLIT: protocolFeeShareBps usage (context) ====="
  grep -n -B6 -A24 'protocolFeeShareBps' "$T" | head -200
  echo ""
  echo "===== buybackBurnBps usage (context) ====="
  grep -n -B6 -A18 'buybackBurnBps' "$T" | head -160
  echo ""
  echo "===== _distribute ====="
  grep -n -A 90 'function _distribute' "$T"
  echo ""
  echo "===== END ====="
} >> "$OUT"
echo DONE
