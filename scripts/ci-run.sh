#!/usr/bin/env bash
# Ejecuta un comando y, si falla, publica las últimas líneas como anotación de GitHub Actions
# (así el error se puede leer sin descargar el registro completo).
# Uso: ci-run.sh "Título" comando [args...]
title="$1"; shift
log="$(mktemp)"
set +e
"$@" 2>&1 | tee "$log"
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  msg="$(tail -n 70 "$log" | sed 's/%/%25/g' | awk '{printf "%s%%0A", $0}')"
  echo "::error title=${title} falló::${msg}"
fi
exit "$code"
