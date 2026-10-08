#!/bin/sh
# Free the WOBI dev server port (see vite.config.ts).
PORTS="5174"

for port in $PORTS; do
	pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN)
	if [ -n "$pids" ]; then
		echo "Killing port $port (pid $pids)"
		kill $pids 2>/dev/null
		sleep 1
		pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN)
		[ -n "$pids" ] && kill -9 $pids 2>/dev/null
	fi
done
exit 0
