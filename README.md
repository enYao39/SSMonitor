# PeTar Interactive N-body Explorer

Stage 1 static browser viewer for the supplied PeTar fixed-wind simulation. It loads the preprocessed, ID-aligned cache and renders every recorded snapshot in a Three.js scene.

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

The converter reads the archive without extracting it, checks snapshot sequence, time monotonicity, per-frame ID uniqueness and 36-column row shape, and writes an interleaved Float32 cache. Positions and velocities are relative to the most massive particle in each snapshot. BSE stellar type, BSE radius and luminosity are read from documented columns 13, 16 and 24 (1-based); radius is Rsun and luminosity is Lsun. IDs remain in a stable sorted index and absent particles have a validity flag of zero. The current VMS ID is recorded per snapshot, including its changes.

The supplied archive contains 793 snapshots from 0 to 78,929.901 yr, 201 unique IDs across the run, and has monotonically increasing time and unique IDs within each snapshot. The most massive particle changes from ID 1 to ID 70; its mass changes from 10,000 to 9,300.701 Msun. The binary cache is about 6.7 MiB. Raw simulation files and random-seed files are not included in the static site.

## Display and playback

The timeline addresses each of the 793 snapshots. Playback traverses the full saved sequence in order; at 1× it advances 10 snapshots per second (about 79 seconds for this run), with 0.5×, 2× and 4× speed options. Seeking the timeline leaves the current play/pause state unchanged. There is no fixed-length edit or event-only playback.

The default companion-star colour is a blackbody-style approximation derived from valid BSE luminosity and radius using `T_eff = 5772 * (L/Lsun)^0.25 / sqrt(R/Rsun)`. Invalid values use a neutral colour. The central VMS has a separate display accent; its colour is not presented as a stellar-atmosphere prediction. The optional four-spike telescope diffraction overlay is a visual rendering effect, not simulated telescope optics. Displayed point sizes are enlarged for legibility.

The scene requests Three.js `WebGPURenderer`; this selects a WebGPU backend where available and falls back to WebGL 2 when required by the browser/device. The app reports the active backend in the scene header.

## Production build and Pages

```sh
npm run build
```

The build writes a static `dist/`. GitHub Actions deployment uses the repository name as Vite's base path for GitHub Pages. The workflow is included, but no repository creation, push, or Pages configuration has been performed.

## Current scope

This is Stage 1: full-snapshot timeline, play/pause and speed control, 3D rotate/zoom/pan, field-of-view presets, speed/temperature/uniform colour modes, optional diffraction spikes, and recorded time/count/VMS-mass readouts. Merger browser, ID detail inspector, trails, interpolation and center zoom remain later-stage features.
