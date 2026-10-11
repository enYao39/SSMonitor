# PeTar Interactive N-body Explorer

Interactive browser viewer for the supplied PeTar fixed-wind simulation. It loads the preprocessed, ID-aligned cache and renders the recorded snapshots in a Three.js scene.

## Run locally

```sh
npm ci
npm run dev
```

Open the address printed by Vite. The generated cache is committed under `public/data`, so the web app does not need Python or the original archive at runtime.

## Prepare the cache

```sh
python scripts/prepare_petar_data.py /path/to/n200_fixedwind_raw_t0-0p07893Myr.tar.gz
```

The converter reads the archive without extracting it, checks snapshot sequence, time monotonicity, per-frame ID uniqueness and 36-column row shape, and writes an interleaved Float32 cache. Positions and velocities are relative to the most massive particle in each snapshot. BSE stellar type, BSE radius and luminosity are read from columns 13, 16 and 24 (1-based); radius is Rsun and luminosity is Lsun. IDs remain in a stable sorted index and absent particles have a validity flag of zero. The current VMS ID is recorded per snapshot, including its changes. If a `data.bse.*` log is present, its coalescence times and participant IDs are recorded in `public/data/events.json`; otherwise snapshot-to-snapshot mass changes are used as explicitly approximate candidates.

The supplied archive contains 793 snapshots from 0 to 78,929.901 yr, 201 unique IDs across the run, and has monotonically increasing time and unique IDs within each snapshot. Its BSE event log records 10 coalescences with participant IDs and event times. The snapshot stellar-type field is code 1 (main sequence) throughout this archive, so a 3D type-colour mode is available but no type-colour changes are expected here. The most massive particle changes from ID 1 to ID 70; its mass changes from 10,000 to 9,300.701 Msun. The binary cache is about 6.7 MiB. Raw simulation files and random-seed files are not included in the static site.

## Display and playback

The timeline addresses each of the 793 snapshots on a physical-time axis. The archive cadence is 99.658966 years per step. Playback speed is set as simulated years per real second (10–1,000 yr/s), with a default of 100 yr/s, so the full run takes about 13 minutes by default. Playback still renders between saved snapshots; cubic Hermite interpolation is the default, with linear and raw-snapshot modes also available. General interpolation is skipped across particle-count changes and VMS-ID changes. A merger's low-mass incoming star is instead propagated over its final snapshot bracket and smoothly faded out to avoid a sudden disappearance. Seeking the timeline leaves the current play/pause state unchanged. At the end, Replay restarts from t=0.

Interpolation provides visual continuity only; it does not recover close orbital detail absent from the 99.66-year sampling and does not change the recorded data. The default companion-star colour is a blackbody-style approximation derived from valid BSE luminosity and radius using `T_eff = 5772 * (L/Lsun)^0.25 / sqrt(R/Rsun)`. Invalid values use a neutral colour. The central VMS has a separate display accent; its colour is not presented as a stellar-atmosphere prediction. The optional four-spike telescope diffraction overlay is a visual rendering effect, not simulated telescope optics. Displayed point sizes are enlarged for legibility.

The scene requests Three.js `WebGPURenderer`; this selects a WebGPU backend where available and falls back to WebGL 2 when required by the browser/device. The app reports the active backend in the scene header.

The central-mass history and timeline share a physical-time x-axis; exact BSE event times drive the timeline ticks, event jump menu and persistent 3D forecast. Incoming low-mass merger participants are amber, while the incoming star for the next event is red; the 3D view includes a colour legend. Selected particles get a bright cyan ring. Clicking the selected particle again clears the selection. Click a particle to monitor its position, velocity, mass, BSE type, radius and luminosity. BSE event logs provide event time and participant IDs, while snapshots provide the changing particle properties; event times are bracketed by the saved snapshots.

## Production build and Pages

```sh
npm run build
```

The build writes a static `dist/`. GitHub Actions deployment uses the repository name as Vite's base path for GitHub Pages. The workflow is included, but no repository creation, push, or Pages configuration has been performed.

## Current scope

The explorer includes the full-snapshot timeline, physical playback-rate control, mass history, merger-event cues, particle selection and monitoring, 3D rotate/zoom/pan, field-of-view presets, speed/temperature/BSE-type/uniform colour modes, optional diffraction spikes, and time/count/VMS-mass readouts.
