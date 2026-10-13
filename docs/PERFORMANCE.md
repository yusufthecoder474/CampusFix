# Measured performance and trade-offs

Measurements are build artifact bytes and a synthetic local Chromium navigation test. They are not production latency, throughput or uptime results.

| Build                          | Total JS/CSS bytes | gzip bytes | Initial entry bytes | Initial entry gzip |
| ------------------------------ | -----------------: | ---------: | ------------------: | -----------------: |
| M4 baseline, commit 3c22e87    |            247,181 |     75,829 |             247,181 |             75,829 |
| M5 before workspace lazy split |            372,231 |    115,474 |             358,132 |            111,241 |
| M5 final                       |            372,299 |    115,946 |             312,577 |             97,274 |

Socket.IO, React Router and TanStack Query increase the total payload compared with M4. The initial payload also remains larger than M4; there is no overall bundle-reduction claim.

Within M5, lazily loading the authenticated Layout/socket code reduces the initial entry by **45,555 raw bytes (12.72%)** and **13,967 gzip bytes**. The trade-off is a separate chunk request after sign-in, not deleted functionality. The request screens are another lazy chunk. Initial here means JS/CSS referenced by the built index; it excludes later route chunks and is not an observed network waterfall or startup-time benchmark.

The final browser cache test performs three detail→list return navigations inside the 30-second fresh window and records **zero additional list HTTP calls**. Initial fetching and detail/history reads are outside that counter. Raw timings in m5-cache-navigation.json include automation overhead and cannot support a percentage latency improvement. No equivalent M4 runtime navigation benchmark was executed.

Reproduce: npm run build; npm run measure:bundle; npm run test:e2e:realtime. Evidence: m5-bundle-baseline.json, m5-bundle-before-layout-split.json, m5-bundle-final.json, m5-cache-navigation.json.

No artificial expensive derived calculation, React.memo, request-throughput benchmark or render-time improvement is claimed. A concrete duplicate-key regression found by browser testing was fixed and covered by a component test. Suite isolation prevents test workloads from exceeding the existing production rate limit; it is not a rate-limit bypass in the application.
