# Process gallery

Three end-to-end teaching flowsheets, within the boundaries described below. Each uses original PFDkit equipment artwork and real document connections. These are conceptual PFDs, not P&IDs or certified plant designs. The 1 kg/s and 25 degC inlet entries are arbitrary examples for learning the quantity API; no process conditions, phase splits, efficiencies, balances or sizing have been calculated.

## Run and edit the examples

Download [gallery_processes.py](https://kami80.github.io/PFDkit/gallery_processes.py), install the library, and run it in a working directory:

```sh
python -m pip install pfd-core
python gallery_processes.py
```

The script writes `distillation.json`, `ethanol.json` and `ammonia.json`. Open these in PFDkit to inspect or edit them. All equipment, ports, configurations, stream labels and entered values are defined in the Python file. Calling `distillation()`, `ethanol()` or `ammonia()` returns a `Document` that can be changed with the graph commands in this guide.

## Binary distillation

Feed, column, condenser, reflux drum, reflux splitter/pump, reboiler and product withdrawals. This teaching subsystem explicitly illustrates the two return paths. Utility circuits, controls and phase calculations are outside scope; the reboiler splitter represents conceptual vapor/liquid withdrawal rather than a calculated phase separation.

<!-- gallery-distillation -->

Reference: [ETH Zurich: Distillation](https://www.hyper-tvt.ethz.ch/distillation-page.html).

## Ethanol fermentation and recovery

Sugar solution is pumped and conditioned before fermentation. A disengagement vessel removes the CO2-rich gas; the broth proceeds to a recovery column producing a hydrous ethanol outlet and stillage. Column configuration represents its condenser/reboiler. Feedstock preparation, ethanol dehydration and coproduct finishing are omitted.

<!-- gallery-ethanol -->

Reference: [US DOE: Ethanol production](https://afdc.energy.gov/fuels/ethanol-production).

## Ammonia synthesis loop

An already-pressurized hydrogen/nitrogen mixture enters a synthesis loop with feed mixing, heating, catalytic reaction, cooling/condensation, separation and a purge/recycle split. Gas production, compression, the recycle circulator, refrigeration details and utilities are outside this boundary. Reactor conversion and separation performance remain unknown.

<!-- gallery-ammonia -->

Reference: [US DOE: Ammonia—From Fertilizer to Energy Carrier](https://www.energy.gov/sites/default/files/2021-05/052721-h2iqhour_0.pdf).

## Reading the symbols and values

Symbols are shared with the PFDkit editor: centrifugal pump, exchanger, vessel/tank, tray or packed column, reactor, mixer, splitter and boundary arrows. Solid arrows are material streams; dashed arrows are energy streams. F, T, P and Q identify entered flow, temperature, pressure and power. A question mark is an explicitly unknown value; absent fields are listed as not entered in the table. Equipment labels and stream values come from the generated JSON, not from a separate illustration.

The SVG diagrams use simplified routing for readability. On small screens, scroll the diagram horizontally or open its full-size SVG. Downloaded JSON preserves the engineering contract and can be edited independently of the documentation.
