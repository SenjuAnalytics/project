#!/usr/bin/env bash
# Temporary probe: pull Pons V2 verified source and extract fee-split logic.
cd /c/Users/shole/OneDrive/Desktop/contracts1 || exit 1
URL="https://sourcify.dev/server/v2/contract/4663/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e?fields=sources"
OUT=pons_analysis.txt
: > "$OUT"

curl -sL "$URL" -o pons_src.json
echo "JSON_BYTES=$(wc -c < pons_src.json)" >> "$OUT"

# Unescape JSON string content into readable Solidity.
sed 's/\\n/\n/g; s/\\"/"/g; s/\\t/\t/g' pons_src.json > pons_src.txt
echo "TXT_LINES=$(wc -l < pons_src.txt)" >> "$OUT"

{
  echo ""
  echo "=== SOL FILE NAMES ==="
  grep -oE '[A-Za-z0-9_]+\.sol' pons_src.json | sort -u

  echo ""
  echo "=== onlyOwner / governance SETTERS (fee/tax/split/share/treasury/protocol/snipe) ==="
  grep -nE 'function set[A-Za-z0-9_]+' pons_src.txt | grep -iE 'fee|tax|split|share|treasury|protocol|snipe'

  echo ""
  echo "=== FEE / SHARE / TAX CONSTANTS & STATE VARS ==="
  grep -nE '(protocol|creator|treasury|platform|curve|team)[A-Za-z]*(Bps|Share|Fee|Tax|Recipient)|MAX_[A-Z_]*(FEE|SHARE|BPS|TAX)|=[[:space:]]*[0-9_]+;[[:space:]]*//' pons_src.txt | head -80

  echo ""
  echo "=== FEE SPLIT / DISTRIBUTION LOGIC ==="
  grep -nE '_accrueFees|_splitFees|_distribute|_sendFees|_payFees|splitBps|protocolShare|creatorShare|treasury' pons_src.txt | head -60
} >> "$OUT"

echo "DONE_WROTE_ANALYSIS bytes=$(wc -c < "$OUT")"
