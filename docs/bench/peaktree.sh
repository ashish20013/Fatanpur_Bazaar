#!/bin/bash
"$@" & PID=$!
PEAK=0
while kill -0 $PID 2>/dev/null; do
  CUR=$(ps -eo rss=,pid=,ppid= | awk -v root=$PID '
    { rss[$2]=$1; parent[$2]=$3 }
    END { for (p in rss) { q=p; d=0; while (q!="" && q!="1" && d<20) { if (q==root) { s+=rss[p]; break } q=parent[q]; d++ } } print s+0 }')
  [ "${CUR:-0}" -gt "$PEAK" ] && PEAK=$CUR
  sleep 0.25
done
wait $PID; RC=$?
echo "PEAK_TREE_RSS_MB=$(awk -v p=$PEAK 'BEGIN{printf "%.0f", p/1024}')"
exit $RC
