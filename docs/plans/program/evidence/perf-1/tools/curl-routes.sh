#!/usr/bin/env bash
# usage: perf1-curl.sh <host> <cookiejar> [extra header]
H=$1; J=$2; HDR=${3:-}
for p in /admin /admin/catalog "/admin/catalog?create=1" "/admin/pos?mode=counter" /admin/messages /admin/appts; do
  for i in 1 2 3; do
    curl -s ${HDR:+-H "$HDR"} -b "$J" -c "$J" -o /dev/null -w "$p run$i code=%{http_code} redir=%{redirect_url} ttfb=%{time_starttransfer} total=%{time_total} bytes=%{size_download}\n" "$H$p"
  done
done
