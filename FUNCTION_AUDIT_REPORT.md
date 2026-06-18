# Daddy's Lease Hackulator — Function/Feature Audit Report
Generated: 2026-02-08

## File Summary

| File | Total Functions | Category |
|------|----------------|----------|
| ULTIMATE | 152 | Primary (Modular) |
| hackulator | 150 | Full-featured variant |
| fixed | 151 | Full-featured variant |
| complete | 162 | Extended (most functions) |
| modular | 52 | Minimal + 19 ext modules |
| daddys_ | 52 | Minimal self-contained |
| gemini | 73 | Gemini AI integration |

**Total unique functions across all files: 172**
**Functions common to ALL 7 files: 48**

## Feature Categories & Coverage

### Core Lease Calculation

| Function | ULT | hack | fix | comp | mod | dad | gem |
|----------|-----|------|-----|------|-----|-----|-----|
| calculateLease | Y | Y | Y | Y | Y | Y | Y |
| calculateFinance | Y | Y | Y | Y | - | - | Y |
| calculateBalloonRemaining | Y | Y | Y | Y | - | - | - |
| leaseTotal | Y | Y | Y | Y | - | - | - |
| financeTotal | Y | Y | Y | Y | - | - | - |
| subLeaseTotal | Y | Y | Y | Y | - | - | - |
| subLeaseAndBuyTotal | Y | Y | Y | Y | - | - | - |
| leaseAndBuyTotal | Y | Y | Y | Y | - | - | - |
| leaseAndBuyMonthly | Y | Y | Y | Y | - | - | - |
| balloonFinanceTotal | Y | Y | Y | Y | - | - | - |
| monthlyValues | Y | Y | Y | Y | - | - | - |
| totalValues | Y | Y | Y | Y | - | - | - |
| mileValues | Y | Y | Y | Y | - | - | - |

### Vehicle State Management

| Function | ULT | hack | fix | comp | mod | dad | gem |
|----------|-----|------|-----|------|-----|-----|-----|
| addVehicleToState | Y | Y | Y | Y | - | - | - |
| removeVehicleFromState | Y | Y | Y | Y | - | - | - |
| updateVehicleInState | Y | Y | Y | Y | - | - | - |
| getVehicle | Y | Y | Y | Y | - | - | - |
| getAllVehicles | Y | Y | Y | Y | - | - | - |
| clearAllVehicles | Y | Y | Y | Y | - | - | - |
| addVehicle | Y | Y | Y | Y | Y | Y | Y |
| removeVehicle | Y | Y | Y | Y | Y | Y | Y |

### Comparison Engine

| Function | ULT | hack | fix | comp | mod | dad | gem |
|----------|-----|------|-----|------|-----|-----|-----|
| compareWithOtherVehicles | Y | Y | Y | Y | - | - | - |
| buildComparisonOutput | Y | Y | Y | Y | - | - | - |
| buildLeaseComparisonTable | Y | Y | Y | Y | - | - | - |
| buildLeaseVsFinanceTable | Y | Y | Y | Y | - | - | - |
| buildAllMetricsTable | Y | Y | Y | Y | - | - | - |
| buildTable | Y | Y | Y | Y | - | - | - |
| getAllComparisonOutputs | Y | Y | Y | Y | - | - | - |
| updateComparisonTable | Y | Y | Y | Y | - | - | - |
| comparisonResults | Y | Y | Y | Y | - | - | - |
| compareTwoVehicles | - | - | - | Y | - | - | - |
| compareMetric | - | - | - | Y | - | - | - |
| determineOverallWinner | - | - | - | Y | - | - | - |
| renderAllPairwiseComparisons | - | - | - | Y | - | - | - |
| renderPairwiseComparison | - | - | - | Y | - | - | - |
| generateAllPairwiseComparisons | - | - | - | Y | - | - | - |
| exportPairwiseComparison | - | - | - | Y | - | - | - |
| updatePairwiseComparisons | - | - | - | Y | - | - | - |
| addPairwiseComparisonStyles | - | - | - | Y | - | - | - |
| calculatedVehicles | - | - | - | Y | - | - | - |
| comparisons | - | - | - | Y | - | - | - |

### Weighted Scorecard

| Function | ULT | hack | fix | comp | mod | dad | gem |
|----------|-----|------|-----|------|-----|-----|-----|
| renderWeightedScorecard | Y | Y | Y | Y | - | - | - |
| renderWeightSelector | Y | Y | Y | Y | - | - | - |
| getCurrentWeights | Y | Y | Y | Y | - | - | - |
| setWeightPreset | Y | Y | Y | Y | - | - | Y |
| autoNormalizeWeights | Y | Y | Y | Y | - | - | - |
| ranked | Y | Y | Y | Y | - | - | - |
| headers | Y | Y | Y | Y | - | - | - |
| rows | Y | Y | Y | Y | - | - | - |
| values | Y | Y | Y | Y | - | - | - |

### Scenario Analysis

| Function | ULT | hack | fix | comp | mod | dad | gem |
|----------|-----|------|-----|------|-----|-----|-----|
| loadScenarios | Y | Y | Y | Y | - | - | - |
| handleScenarioSelection | Y | Y | Y | Y | - | - | - |
| selectScenarioForCard | Y | Y | Y | Y | - | - | - |
| displayScenarioDetails | Y | Y | Y | Y | - | - | - |
| addScenarioSelector | Y | Y | Y | Y | - | - | - |
| addScenarioStyles | Y | Y | Y | Y | - | - | - |
| initializeScenarioSelectors | Y | Y | Y | Y | - | - | - |
| populateAllScenarioSelectors | Y | Y | Y | Y | - | - | - |
| populateScenarioSelector | Y | Y | Y | Y | - | - | - |
| selectedScenario | Y | Y | Y | Y | - | - | - |
| runScenarioAnalysis | Y | Y | Y | Y | - | - | Y |
| generateScenarioAnalysis | Y | Y | Y | Y | - | - | - |
| buildAndScoreAllScenarios | Y | Y | Y | Y | - | - | - |
| buildAllScenariosForCard | Y | Y | Y | Y | - | - | - |
| updateScenarioDisplay | Y | Y | Y | Y | - | - | - |
| exportScenarioResults | Y | Y | Y | Y | - | - | - |
| showScenarioComparisonModal | Y | Y | Y | Y | - | - | - |
| scenarios | Y | Y | Y | Y | - | - | - |

### Golden Rule Validation

| Function | ULT | hack | fix | comp | mod | dad | gem |
|----------|-----|------|-----|------|-----|-----|-----|
| validateGoldenRule | Y | Y | Y | Y | - | - | - |
| calculateGoldenRuleTarget | Y | Y | Y | Y | - | - | - |
| renderGoldenRuleBadge | Y | Y | Y | Y | - | - | - |
| updateGoldenRuleBadge | Y | Y | Y | Y | - | - | - |
| showGoldenRuleAdjustments | Y | Y | Y | Y | - | - | - |
| suggestGoldenRuleAdjustments | Y | Y | Y | Y | - | - | - |
| applyGoldenRuleSuggestion | Y | Y | Y | Y | - | - | - |
| addGoldenRuleStyles | Y | Y | Y | Y | - | - | - |
| addComparisonGoldenRuleStyles | Y | Y | Y | Y | - | - | - |
| addGoldenRuleSummaryToComparison | Y | Y | Y | Y | - | - | - |
| goldenRuleFailures | Y | Y | Y | Y | - | - | - |

### Trade-In Optimization

| Function | ULT | hack | fix | comp | mod | dad | gem |
|----------|-----|------|-----|------|-----|-----|-----|
| analyzeTradeOptimization | Y | Y | Y | Y | - | - | - |
| analyzeTradeEquityScenarios | Y | Y | Y | Y | - | - | - |
| calculateTradeImpact | Y | Y | Y | Y | - | - | - |
| calculateTradeValueScore | Y | Y | Y | Y | - | - | - |
| findOptimalTradeDistribution | Y | Y | Y | Y | - | - | - |
| generateTradeRecommendation | Y | Y | Y | Y | - | - | - |
| renderTradeOptimization | Y | Y | Y | Y | - | - | - |
| updateTradeOptimizationPanel | Y | Y | Y | Y | - | - | - |
| applyTradeOptimization | Y | Y | Y | Y | - | - | - |
| addTradeOptimizationStyles | Y | Y | Y | Y | - | - | - |
| equityStrategyLabel | Y | Y | Y | Y | - | - | Y |

### Amortization/Schedules

| Function | ULT | hack | fix | comp | mod | dad | gem |
|----------|-----|------|-----|------|-----|-----|-----|
| generateAmortizationSchedule | Y | Y | Y | Y | - | - | - |
| generateBalloonSchedule | Y | Y | Y | Y | - | - | - |
| generateLeaseSchedule | Y | Y | Y | Y | - | - | - |

### Enhanced Residual/MF Lookup

| Function | ULT | hack | fix | comp | mod | dad | gem |
|----------|-----|------|-----|------|-----|-----|-----|
| getEnhancedMoneyFactor | Y | Y | Y | Y | - | - | Y |
| getEnhancedResidual | Y | Y | Y | Y | - | - | Y |
| getResidualFromAggregated | Y | Y | Y | Y | - | - | Y |
| getResidualFromFallback | Y | Y | Y | Y | - | - | Y |
| getResidualFromManufacturer | Y | Y | Y | Y | - | - | Y |
| getScrapedMfrData | Y | Y | Y | Y | - | - | - |
| initializeScrapedData | Y | Y | Y | Y | - | - | Y |
| formatResidualResult | Y | Y | Y | Y | - | - | Y |
| applyMileageAdjustment | Y | Y | Y | Y | - | - | Y |
| applyTermAdjustment | Y | Y | Y | Y | - | - | Y |
| getTierForDistance | Y | Y | Y | Y | - | - | Y |

### EPA/Fuel Data

| Function | ULT | hack | fix | comp | mod | dad | gem |
|----------|-----|------|-----|------|-----|-----|-----|
| fetchEPAData | Y | Y | Y | Y | Y | Y | Y |
| calculateFuelCost | - | - | - | - | - | - | - |
| updateFuelFieldVisibility | Y | - | Y | Y | Y | Y | Y |
| fuelType | Y | Y | Y | - | Y | Y | - |

### VIN Decoding

| Function | ULT | hack | fix | comp | mod | dad | gem |
|----------|-----|------|-----|------|-----|-----|-----|
| decodeVIN | Y | Y | Y | Y | Y | Y | Y |
| decodeVINNHTSA | - | - | - | - | - | - | Y |

### Incentive Lookup (Gemini exclusive)

| Function | ULT | hack | fix | comp | mod | dad | gem |
|----------|-----|------|-----|------|-----|-----|-----|
| buildIncentivesSummary | - | - | - | - | - | - | Y |
| fetchIncentivesFromMarketCheck | - | - | - | - | - | - | Y |
| getNextMarketCheckKey | - | - | - | - | - | - | Y |
| getZipCoordinates | - | - | - | - | - | - | Y |
| parseIncentiveResults | - | - | - | - | - | - | Y |
| searchIncentivesByRadius | - | - | - | - | - | - | Y |

### Report Generation/Export

| Function | ULT | hack | fix | comp | mod | dad | gem |
|----------|-----|------|-----|------|-----|-----|-----|
| generateVehicleReport | Y | Y | Y | Y | - | - | - |
| downloadVehicleReport | Y | Y | Y | Y | - | - | - |
| generateRecommendations | Y | Y | Y | Y | - | - | - |

### UI/Rendering

| Function | ULT | hack | fix | comp | mod | dad | gem |
|----------|-----|------|-----|------|-----|-----|-----|
| generateMatrixTable | Y | Y | Y | Y | Y | Y | Y |
| initializeEnhancedFeatures | Y | Y | Y | Y | - | - | - |
| formatCurrency | Y | Y | Y | Y | - | - | - |
| formatValue | - | - | - | Y | - | - | - |
| fixStrategies | Y | Y | Y | Y | - | - | - |
| scoredStrategies | Y | Y | Y | Y | - | - | - |
| applyIncentive | Y | Y | Y | Y | Y | Y | - |
| calculateIncentiveDistance | Y | Y | Y | Y | - | - | Y |
| onProgress | Y | Y | Y | Y | - | - | Y |
| idx | Y | Y | Y | Y | Y | Y | - |
| index | - | - | - | - | - | - | Y |

### External Data Loading

| Function | ULT | hack | fix | comp | mod | dad | gem |
|----------|-----|------|-----|------|-----|-----|-----|
| loadExternalData | Y | - | - | - | - | - | - |
| loadScenarios | Y | Y | Y | Y | - | - | - |

## Exclusive Functions (only in ONE file)

### ULTIMATE (1 exclusive)
- `loadExternalData`

### complete (12 exclusive)
- `addPairwiseComparisonStyles`
- `calculatedVehicles`
- `compareMetric`
- `compareTwoVehicles`
- `comparisons`
- `determineOverallWinner`
- `exportPairwiseComparison`
- `formatValue`
- `generateAllPairwiseComparisons`
- `renderAllPairwiseComparisons`
- `renderPairwiseComparison`
- `updatePairwiseComparisons`

### gemini (8 exclusive)
- `buildIncentivesSummary`
- `decodeVINNHTSA`
- `fetchIncentivesFromMarketCheck`
- `getNextMarketCheckKey`
- `getZipCoordinates`
- `index`
- `parseIncentiveResults`
- `searchIncentivesByRadius`

## Feature Tier Summary

### Tier 1 — Full Featured (ULTIMATE, hackulator, fixed, complete)
These files contain 150-162 functions covering ALL feature areas:
- Core lease/finance calculations
- Multi-vehicle comparison engine
- Weighted scorecard system
- Scenario analysis (50 pre-built scenarios)
- Golden Rule validation
- Trade-in optimization
- Amortization schedule generation
- Enhanced residual/money factor lookup
- EPA fuel data integration
- VIN decoding
- Report generation/export

### Tier 2 — Gemini AI (gemini)
73 functions — has core calculations plus 8 EXCLUSIVE AI-powered features:
- **Incentive lookup via MarketCheck API** (radius-based dealer incentive search)
- **NHTSA VIN decoding** (alternative VIN decoder)
- **Zip code geolocation** (coordinate-based proximity search)
- Missing: Golden Rule, Trade Optimization, Weighted Scorecard, Scenarios, Amortization

### Tier 3 — Minimal (modular, daddys_)
52 functions each — core calculation engine only:
- Basic lease/finance calculations
- EPA data lookup
- VIN decoding
- Missing: Comparison engine, Golden Rule, Trade Optimization, Weighted Scorecard, Scenarios, Amortization, Report generation

### complete-only features (12 exclusive)
The `complete` file has a full **Pairwise Comparison Engine** not found in any other file:
- Head-to-head vehicle comparisons across all metrics
- Overall winner determination
- Exportable pairwise comparison reports

### ULTIMATE-only features (1 exclusive)
- `loadExternalData` — Async external JSON data loader (modular architecture)

## Functions Missing from Each File

### ULTIMATE — Missing 20 of 172 total
- `addPairwiseComparisonStyles`
- `buildIncentivesSummary`
- `calculatedVehicles`
- `compareMetric`
- `compareTwoVehicles`
- `comparisons`
- `decodeVINNHTSA`
- `determineOverallWinner`
- `exportPairwiseComparison`
- `fetchIncentivesFromMarketCheck`
- `formatValue`
- `generateAllPairwiseComparisons`
- `getNextMarketCheckKey`
- `getZipCoordinates`
- `index`
- `parseIncentiveResults`
- `renderAllPairwiseComparisons`
- `renderPairwiseComparison`
- `searchIncentivesByRadius`
- `updatePairwiseComparisons`

### hackulator — Missing 22 of 172 total
- `addPairwiseComparisonStyles`
- `buildIncentivesSummary`
- `calculatedVehicles`
- `compareMetric`
- `compareTwoVehicles`
- `comparisons`
- `decodeVINNHTSA`
- `determineOverallWinner`
- `exportPairwiseComparison`
- `fetchIncentivesFromMarketCheck`
- `formatValue`
- `generateAllPairwiseComparisons`
- `getNextMarketCheckKey`
- `getZipCoordinates`
- `index`
- `loadExternalData`
- `parseIncentiveResults`
- `renderAllPairwiseComparisons`
- `renderPairwiseComparison`
- `searchIncentivesByRadius`
- `updateFuelFieldVisibility`
- `updatePairwiseComparisons`

### fixed — Missing 21 of 172 total
- `addPairwiseComparisonStyles`
- `buildIncentivesSummary`
- `calculatedVehicles`
- `compareMetric`
- `compareTwoVehicles`
- `comparisons`
- `decodeVINNHTSA`
- `determineOverallWinner`
- `exportPairwiseComparison`
- `fetchIncentivesFromMarketCheck`
- `formatValue`
- `generateAllPairwiseComparisons`
- `getNextMarketCheckKey`
- `getZipCoordinates`
- `index`
- `loadExternalData`
- `parseIncentiveResults`
- `renderAllPairwiseComparisons`
- `renderPairwiseComparison`
- `searchIncentivesByRadius`
- `updatePairwiseComparisons`

### complete — Missing 10 of 172 total
- `buildIncentivesSummary`
- `decodeVINNHTSA`
- `fetchIncentivesFromMarketCheck`
- `fuelType`
- `getNextMarketCheckKey`
- `getZipCoordinates`
- `index`
- `loadExternalData`
- `parseIncentiveResults`
- `searchIncentivesByRadius`

### modular — Missing 120 of 172 total
Missing functions: `addComparisonGoldenRuleStyles`, `addGoldenRuleStyles`, `addGoldenRuleSummaryToComparison`, `addPairwiseComparisonStyles`, `addScenarioSelector`, `addScenarioStyles`, `addTradeOptimizationStyles`, `addVehicleToState`, `analyzeTradeEquityScenarios`, `analyzeTradeOptimization`, `applyGoldenRuleSuggestion`, `applyMileageAdjustment`, `applyTermAdjustment`, `applyTradeOptimization`, `autoNormalizeWeights` ... and 105 more

### daddys_ — Missing 120 of 172 total
Missing functions: `addComparisonGoldenRuleStyles`, `addGoldenRuleStyles`, `addGoldenRuleSummaryToComparison`, `addPairwiseComparisonStyles`, `addScenarioSelector`, `addScenarioStyles`, `addTradeOptimizationStyles`, `addVehicleToState`, `analyzeTradeEquityScenarios`, `analyzeTradeOptimization`, `applyGoldenRuleSuggestion`, `applyMileageAdjustment`, `applyTermAdjustment`, `applyTradeOptimization`, `autoNormalizeWeights` ... and 105 more

### gemini — Missing 99 of 172 total
Missing functions: `addComparisonGoldenRuleStyles`, `addGoldenRuleStyles`, `addGoldenRuleSummaryToComparison`, `addPairwiseComparisonStyles`, `addScenarioSelector`, `addScenarioStyles`, `addTradeOptimizationStyles`, `addVehicleToState`, `analyzeTradeEquityScenarios`, `analyzeTradeOptimization`, `applyGoldenRuleSuggestion`, `applyIncentive`, `applyTradeOptimization`, `autoNormalizeWeights`, `balloonFinanceTotal` ... and 84 more
