# daddy's Lease Hackulator v3.0 — Complete Rebuild Plan

## Overview
Complete from-scratch rebuild of the Lease Hackulator as a clean, working application. Three output versions: single HTML, hybrid, and modular. All missing features from the user's list will be included.

## Architecture

### File Structure (Modular Primary, then packaged into other formats)
```
v3/
├── index.html              ← Clean HTML structure + embedded CSS
├── css/
│   └── hackulator.css      ← All styles (also inlined for single-file version)
├── js/
│   ├── app.js              ← Main app controller, vehicle management, UI
│   ├── calculations.js     ← Lease/Finance/Balloon calc engines
│   ├── api.js              ← VIN decode (MarketCheck → NHTSA → free fallback), ZIP lookup
│   ├── data.js             ← EPA data, manufacturer fees, residuals, scenarios
│   └── utils.js            ← Formatting, helpers, export
├── data/
│   ├── epa_vehicles.json
│   ├── man_fees.json
│   ├── scraped_residuals.json
│   └── scenarios.json
└── dist/
    ├── hackulator_single.html     ← All-in-one single file
    └── hackulator_hybrid.html     ← HTML+CSS inline, JS external
```

## Missing Features — Full Implementation List

### 1. Vehicle Condition Dropdown ✅ (exists but broken layout)
- Clean `<select>` with New / CPO / Pre-Owned options
- Condition affects: residual lookup, available deal types, fee defaults

### 2. Dealer Information Section ✅ (exists but unstyled)
- Fields: Dealer Name, Phone, Location, Stock #, Days on Market, Source, Listing URL
- Auto-populated from MarketCheck VIN/listing lookup
- Distance from user ZIP calculated and displayed

### 3. Tabbed Vehicle Cards ✅ (exists but CSS broken)
- 3 tabs: Input | Results | Scenarios
- Clean tab switching with active state indicators
- Each tab's content properly scoped to that card

### 4. Auto-Population from VIN
- **MarketCheck** (primary): Year, Make, Model, Trim, Color, MSRP, Listing Price, Dealer Info, Mileage
- **NHTSA** (fallback): Year, Make, Model, Fuel Type, Body Type
- **EPA Data** (supplement): MPG/MPGe, Battery Size, Range, Fuel Tank Size
- **Manufacturer Fees DB**: Acquisition Fee, Disposition Fee by brand
- **Residual DB**: Residual % by make/model/term/mileage

### 5. Auto-Population from ZIP
- **Zippopotam API** (primary, free): City, State, County
- **PositionStack** (fallback): Full address resolution
- Tax rate: State-level default lookup table (embedded), editable by user
- Distance calculation: Haversine formula from user ZIP to dealer ZIP

### 6. MPG / MPGe Fields
- Gas: City MPG, Hwy MPG, Combined MPG, Fuel Tank Size, Avg Gas Price
- EV: City MPGe, Hwy MPGe, Combined MPGe, Battery kWh, Range, L2 $/kWh, L3 $/kWh
- PHEV: All of the above + Electric Range, % Electric Driving
- Toggle visibility based on fuel type checkbox selection

### 7. Money Factor + APR/MF Sync
- Money Factor input (e.g., 0.00125)
- APR input (e.g., 3.00%)
- Bidirectional sync: changing MF updates APR (×2400), changing APR updates MF (÷2400)
- Visual indicator showing both values

### 8. Trade Equity Scenario Selection
- Trade Allowance + Payoff Amount → auto-calculates Trade Equity
- Scenarios: Cap Reduction, Split 50/50, At Buyout, Check Back
- Each scenario changes how equity flows into the deal structure
- Negative equity handling (rolled into cap cost)

### 9. Incentives / Fuel / Energy Section
- Lease Incentives, Finance Incentives, State EV Credit
- Fetch from MarketCheck API by year/make/model/zip
- Display as actionable cards with "Apply" buttons
- Fuel cost calculator: annual gas cost, annual charging cost (L2 and L3)
- PHEV mixed cost calculation

### 10. Full Financial Breakdown (Results Tab)
- **Capitalization**: MSRP → Selling Price → Incentives → Trade → Down → Capped Fees → Adjusted Cap Cost
- **Depreciation**: Residual Value ($, %), Total Depreciation, Monthly Depreciation
- **Finance Charge**: Money Factor, APR Equivalent, Monthly Rent Charge
- **Payment**: Base Payment, Monthly Tax, Total Monthly Payment
- **Upfront**: First Month, Drive-Off Fees, Down Payment, Trade Cash, MSD Deposit, Total Due at Signing
- **Total Spend**: All Payments, Upfront + Payments, Buyout (Residual), Total Cost to Own, Cost Per Mile

### 11. Deal Type Selection
- Lease (Closed End), Finance, Balloon Lease, Balloon Finance, Cash
- Lease subtypes: Closed End, Subvented, Single Pay, Subvented + Single Pay
- Show/hide relevant fields based on deal type

### 12. Residual Amount $ and %
- Residual % input (editable)
- Residual $ auto-calculated (MSRP × Residual %)
- Bidirectional: changing $ recalculates %, changing % recalculates $
- Auto-lookup from scraped residuals DB by make/model/term/mileage

### 13. Fees with Capitalization Options
- Acquisition Fee (+ Cap checkbox)
- Dealer/Doc Fee (+ Cap checkbox)
- Registration Fee (+ Cap checkbox)
- Title Fee (+ Cap checkbox)
- Disposition Fee (end of lease)
- Other Fees (+ Cap checkbox)
- "Cap" = capitalize into lease (spread over monthly), uncapped = due at signing

### 14. Listing & Capitalized Prices
- Original MSRP (from VIN decode)
- Current Listing Price (from MarketCheck)
- Negotiated Selling Price (user input)
- Capitalized Amount (selling price + capped fees - reductions)
- Discount from MSRP shown as $ and %

### 15. Listing Details
- VIN, Stock #, Mileage, Days on Market
- Source (dealer website, Cars.com, etc.)
- Listing URL (clickable link)
- Photos count, Certified status

### 16. Comparison Details
- Side-by-side table for all calculated vehicles
- Metrics: Monthly Payment, Total Cost, Cost Per Mile, Due at Signing, Depreciation, Interest, Capitalized Cost Reductions/Equity Applications 
- Weighted scoring with 4 presets
- Visual winner highlighting
- Comparison of lease vs. finance, lease vs. balloon, finance vs. balloon finding the most cost effective and money saving offer 

### 17. Tax Methods
- Monthly Payment (tax on base payment)
- Monthly Payment + Fees (tax on payment + amortized fees)
- Monthly Depreciation (tax only on depreciation component)
- Capitalized Cost (tax on cap cost / term)
- Upfront (full tax due at signing, $0 monthly tax)

### 18. Fuel Costs / Charging Costs (in Vehicle Cards)
- Gas tab: Annual fuel cost = (Annual Miles / Combined MPG) × Gas Price
- EV tab: Annual L2 cost, Annual L3 cost, kWh per 100 miles
- PHEV tab: Blended annual cost (electric % × EV cost + gas % × gas cost)
- Monthly fuel/energy cost shown in results

### 19. APR/MF Sync
- Already covered in #7 — bidirectional sync with event listeners

### 20. MSD (Multiple Security Deposits)
- Enable/disable checkbox
- Number of MSDs (1-10, default 7)
- Reduction per MSD (default 0.00007)
- Auto-reduces effective money factor
- MSD deposit amount = ceil(monthly payment) × count
- Added to due-at-signing total
- Interest savings analysis shown in results

### 21. Zero Drive-Off Option
- Checkbox: "Zero Drive-Off (Cap All Fees)"
- When checked: all fees are capitalized (spread into monthly payments)
- Drive-off amount becomes just first month payment
- Trade equity can be applied as check-back for true $0

### 22. Auto-Pop Vehicle Details from VIN
- Covered in #4 — full chain: MarketCheck → NHTSA → EPA → Manufacturer Fees → Residuals

### 23. Auto-Pop Location from ZIP
- Covered in #5 — Zippopotam → PositionStack fallback → State tax table

### 24. Fee Capitalization Options
- Covered in #13 — each fee has individual cap checkbox + zero drive-off master toggle

### 25. Vehicle Distance from ZIP
- Haversine distance calculation
- User ZIP coords (from Zippopotam/PositionStack)
- Dealer coords (from MarketCheck listing or dealer location)
- Display as "X miles away" badge on vehicle card

## Implementation Phases (All Done in One Build)

### Phase 1: HTML Structure
- Header with branding
- Action bar (Add Vehicle, Calculate All, Matrix, Compare, Export, Print, Theme)
- Comparison section with weighted scoring
- Matrix analysis section
- Vehicle card template with all 3 tabs and all form sections

### Phase 2: CSS
- Design system (variables, typography, spacing)
- Layout (responsive grid, card structure)
- Form styling (inputs, selects, checkboxes, labels)
- Tab system
- Results breakdown styling
- Comparison table
- Toast notifications
- Print styles
- Light/Dark theme toggle

### Phase 3: JavaScript — Data Layer
- EPA database (embedded or external JSON)
- Manufacturer fees database
- Residual values database
- Scenario definitions
- State tax rate defaults
- API key management with rotation

### Phase 4: JavaScript — API Layer
- VIN decode chain: MarketCheck → NHTSA → supplemental
- ZIP lookup: Zippopotam → PositionStack
- Incentives fetch from MarketCheck
- Distance calculation (Haversine)
- Error handling and rate limit management

### Phase 5: JavaScript — Calculation Engine
- Lease calculator (full breakdown with all tax methods)
- Finance calculator (amortization)
- Balloon lease/finance
- Single pay lease
- Subvented lease
- MSD reduction
- Fee capitalization logic
- Zero drive-off logic
- Trade equity scenarios
- Cost per mile
- Fuel/energy cost calculations

### Phase 6: JavaScript — UI Controller
- Vehicle card management (add, duplicate, clear, remove)
- Tab switching
- Fuel type field visibility toggling
- APR/MF sync
- Residual $/% sync
- Trade equity auto-calculation
- Balloon field visibility
- MSD field visibility
- Results population
- Comparison table generation
- Weighted scoring
- Matrix analysis
- Export (JSON, CSV)
- Print formatting
- Theme toggle

### Phase 7: Packaging
- Build single-file version (inline all CSS + JS + data)
- Build hybrid version (inline CSS, external JS)
- Keep modular version as-is

## Results Tab — Enhanced Deal Comparison

### Per-Vehicle Deal Comparison
Each vehicle card's Results tab will show ALL deal types calculated simultaneously:
- **Lease Breakdown**: Full capitalization waterfall, depreciation, rent charge, tax, payment, upfront, total spend
- **Finance Breakdown**: Amount financed, PMT calculation, amortization schedule, total interest, total cost
- **Balloon Breakdown**: Initial payment period, balloon amount/due month, refinanced payment, total cost
- **Deal Type Comparison Table** within each card: Side-by-side Lease vs Finance vs Balloon showing:
  - Monthly Payment (winner badge)
  - Total Cost of Ownership (winner badge)
  - Cost Per Mile (winner badge)
  - Due at Signing (winner badge)
  - Total Interest/Rent Charge paid

### Cross-Vehicle Comparison
- Weighted scoring matrix across all vehicles
- Winner badges: Best Monthly, Best Total, Best CPM, Best Drive-Off
- Pairwise comparisons (Vehicle A vs B)
- Overall recommendation with reasoning

### Trade-In Optimization
- Which vehicle to trade first based on:
  - Current equity position (allowance - payoff)
  - Depreciation trajectory
  - Impact on new deal structure
  - Net cost savings from optimal trade timing

## API Keys (from existing code)
- MarketCheck: 5 keys with rotation
- NHTSA: Free, no key needed
- Zippopotam: Free, no key needed
- PositionStack: Key needed (from existing code)

## Design System
- Primary: #BA0000 (burgundy red)
- Secondary: #13274F (dark navy)
- Accent: #C1D32F (lime green)
- Gold: #FDB927
- Background: Navy gradient → Red → White
- Fonts: Cormorant Garamond (headings), Montserrat (body)
- Card BG: White with subtle shadow
- Form inputs: Clean underline style on white background
- Readable text: Dark text on white card backgrounds
