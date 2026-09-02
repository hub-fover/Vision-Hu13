# Shared contracts

`shared/contracts.json` is the source of truth for portable defaults and error
codes. `StitchOptions` configures feature analysis, matching gates, blending,
output caps, and warnings. `MatchMetrics` records the filtering and geometric
quality measurements for each adjacent pair. Both runtimes must preserve these
names and values.

Image count is unlimited. The application warns only above six images or more
than 60 source megapixels. Mobile JPEG output is capped at 12MP; HD output is
capped at 24MP and must respect the 384MiB estimated working-set limit.
