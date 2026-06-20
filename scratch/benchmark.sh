#!/bin/bash
echo "Benchmarking Cache Test Endpoint..."
for i in {1..10}; do
  curl -o /dev/null -s -w "Request $i: %{time_total}s\n" http://127.0.0.1:8000/cache-test
done
