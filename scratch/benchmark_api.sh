#!/bin/bash
echo "Benchmarking Public Brands API Endpoint..."
# First request to warm cache
echo "Warming cache (MongoDB)..."
curl -o /dev/null -s -w "Cache Miss: %{time_total}s\n" http://127.0.0.1:8000/api/v1/brands/public-list

echo "Testing Cache Hits (Redis)..."
for i in {1..5}; do
  curl -o /dev/null -s -w "Cache Hit $i: %{time_total}s\n" http://127.0.0.1:8000/api/v1/brands/public-list
done
