Analyze the specified code for performance optimizations:

1. **Google Sheets Operations**:
   - Identify individual read/write operations that could be batched
   - Find N+1 query patterns (reading one row at a time in a loop)
   - Suggest using `getDataRange()` instead of `getRange(row, col).getValue()`
   - Recommend batch writes using `setValues()` instead of multiple `appendRow()`
   - Identify opportunities to reduce sheet access frequency

2. **Caching Opportunities**:
   - Find frequently-read data that rarely changes (roster data, poll questions)
   - Suggest appropriate cache duration based on data volatility
   - Identify cache invalidation points
   - Recommend Script Properties vs CacheService vs in-memory caching

3. **Polling Optimizations**:
   - Analyze polling frequency (2.5s default)
   - Suggest adaptive polling (faster when active, slower when idle)
   - Recommend jittered intervals to prevent thundering herd
   - Identify unnecessary polling (e.g., when poll is not active)

4. **Data Structures**:
   - Suggest Map/Set instead of array.find() for lookups
   - Recommend pre-computing derived data instead of calculating on each request
   - Identify opportunities to reduce JSON parsing/stringifying

5. **Execution Time**:
   - Estimate execution time for critical paths
   - Identify functions at risk of 6-minute timeout
   - Suggest breaking long operations into chunks
   - Recommend async triggers for background work

6. **Network Requests**:
   - Minimize RPC calls from client (batch multiple operations)
   - Reduce payload size (send only necessary data)
   - Suggest compression for large responses

For each optimization, provide:
- Current implementation (with line numbers)
- Performance bottleneck explanation
- Proposed optimization (with code example)
- Expected performance improvement (e.g., "50% faster", "reduces API calls by 80%")
- Trade-offs or risks (if any)

Prioritize optimizations by impact (high-frequency operations, user-facing delays).
